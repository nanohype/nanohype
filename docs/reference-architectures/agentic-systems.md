# Reference Architecture: Agentic Systems

**Status:** Reference
**Audience:** Template users evaluating agentic templates, developers extending them

---

## 1. What Is an Agentic System?

An agentic system is a program where an LLM operates in an autonomous loop — receiving a goal, deciding what actions to take, executing those actions via tools, observing the results, and repeating until the goal is met or a termination condition is reached. The LLM is not just generating text; it is making decisions that drive program flow.

The defining characteristic is **autonomy over control flow**. A chatbot answers one question at a time. An agent decides what to do next, does it, evaluates whether it worked, and continues. The human sets the goal; the agent figures out the steps.

This is distinct from:

- **Single-turn LLM calls** — one prompt in, one response out, no tool use
- **Chain pipelines** — fixed sequences of LLM calls where the steps are hardcoded
- **Human-in-the-loop workflows** — where every action requires explicit approval

Agentic systems sit on a spectrum. A simple agent might loop 3-5 times with one tool. A complex agent might orchestrate sub-agents, maintain persistent memory, and run for minutes. The architecture scales with complexity — start simple.

---

## 2. Core Patterns

### 2.1 ReAct (Reason + Act)

The most common and well-understood agentic pattern. The LLM alternates between reasoning about what to do and taking action.

**Loop structure:**

1. **Observe** — receive the current state (user goal + previous observations)
2. **Think** — reason about what to do next (emitted as text, often called "scratchpad")
3. **Act** — select and invoke a tool with specific arguments
4. **Observe** — receive the tool result
5. Repeat until the agent decides to emit a final answer

```text
User goal: "Find the top 3 Python files by line count in this repo"

Think: I need to list Python files first. I'll use the shell tool.
Act:   shell(command="find . -name '*.py' -type f")
Observe: ./src/main.py ./src/utils.py ./tests/test_main.py ...

Think: Now I need line counts for each. I'll use wc -l.
Act:   shell(command="wc -l ./src/main.py ./src/utils.py ...")
Observe: 342 ./src/main.py  89 ./src/utils.py ...

Think: I have the data. The top 3 are main.py (342), ...
Act:   final_answer("The top 3 Python files by line count are: ...")
```

**When to use:** General-purpose agents, exploratory tasks, situations where the number of steps is not known in advance. Good default choice.

**Tradeoffs:** Can meander on complex tasks. The reasoning trace consumes context window. No explicit plan means the agent might repeat itself or go in circles.

### 2.2 Plan-and-Execute

The agent first creates an explicit plan (a list of steps), then executes each step. A separate planning phase produces structure that the execution phase follows.

**Loop structure:**

1. **Plan** — given the goal, produce a numbered list of steps
2. **Execute** — for each step, invoke the appropriate tools
3. **Replan** (optional) — after each step or on failure, revise the remaining plan
4. **Synthesize** — combine results into a final answer

```text
User goal: "Set up a new Python project with tests and CI"

Plan:
  1. Create directory structure (src/, tests/)
  2. Initialize pyproject.toml with project metadata
  3. Create a minimal module in src/
  4. Create a test file in tests/
  5. Add a GitHub Actions workflow for CI
  6. Verify the test runs locally

Execute step 1: shell(command="mkdir -p src tests")
Execute step 2: write_file(path="pyproject.toml", content="...")
...
```

**When to use:** Multi-step tasks with clear decomposition, tasks where you want auditability (the plan is inspectable), tasks where parallel execution of steps is possible.

**Tradeoffs:** Planning adds latency and token cost upfront. The plan can become stale if early steps change the situation. Replanning adds complexity. Overkill for simple tasks.

### 2.3 Reflection / Self-Critique

The agent evaluates its own output before returning it. A second LLM call (or a separate prompt within the same conversation) reviews the work and either approves it or requests revisions.

**Loop structure:**

1. **Generate** — produce an initial output
2. **Critique** — evaluate the output against criteria (correctness, completeness, style)
3. **Revise** — if the critique identifies issues, regenerate with the feedback
4. Repeat critique-revise until acceptable or max iterations reached

```text
Generate: [draft code for a sorting function]
Critique: "The function doesn't handle empty lists. Also, the variable
           name 'x' is unclear."
Revise:   [updated code with empty list check and better names]
Critique: "Looks correct. Edge cases handled. Readable."
→ Return final version
```

**When to use:** Code generation, writing tasks, any output where quality matters more than speed. Works well as an inner loop inside ReAct or Plan-and-Execute.

**Tradeoffs:** Doubles (or more) the token cost. The model critiquing itself may miss its own blind spots. Best combined with other patterns rather than used standalone.

---

## 3. Component Architecture

An agentic system is composed of discrete components. Understanding each one helps you evaluate what a template provides and what you need to add.

### 3.1 Orchestrator

The central loop that coordinates everything. It:

- Manages the conversation state (message history)
- Sends messages to the LLM
- Parses the LLM's response to determine if it contains a tool call or a final answer
- Routes tool calls to the executor
- Appends tool results back into the conversation
- Enforces termination conditions (max iterations, timeout, stop tokens)

The orchestrator is typically 50-200 lines of code. It should be the simplest component — complexity belongs in tools and prompts, not in loop logic.

```python
def run_agent(goal: str, tools: list[Tool], max_steps: int = 10) -> str:
    messages = [system_prompt(), user_message(goal)]

    for step in range(max_steps):
        response = llm.chat(messages, tools=tools)

        if response.is_final_answer:
            return response.text

        tool_call = response.tool_calls[0]
        result = execute_tool(tool_call, tools)
        messages.append(assistant_message(response))
        messages.append(tool_result_message(result))

    return "Max steps reached without a final answer."
```

### 3.2 Tool Registry

A catalog of available tools, each described with a name, description, and input schema. The registry is passed to the LLM so it knows what tools exist and how to call them.

Key design decisions:

- **Static vs dynamic** — are tools fixed at startup or can the agent discover/load tools at runtime?
- **Schema format** — JSON Schema is the standard. Most LLM APIs accept it natively.
- **Namespacing** — important when composing multiple tool sources (e.g., MCP servers)

```python
tools = [
    Tool(
        name="read_file",
        description="Read the contents of a file at the given path",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Absolute file path"}
            },
            "required": ["path"]
        }
    ),
    # ...
]
```

### 3.3 Tool Executor

The runtime that actually invokes tools. Separate from the registry (which is metadata). The executor handles:

- Input validation against the tool's schema
- Sandboxing and permission checks
- Timeout enforcement
- Error capture and formatting
- Output truncation (tool results that exceed context limits)

### 3.4 Memory

Memory is the mechanism by which the agent retains information across steps and across sessions.

**Short-term memory** is the conversation history — the messages array passed to the LLM. It grows with each step and is bounded by the context window.

**Long-term memory** is an external store (database, vector store, file system) that the agent can read from and write to via tools. It persists across sessions.

See section 4 for memory strategies in detail.

### 3.5 Output Parser

Interprets the LLM's response to extract structured data — tool calls, final answers, reasoning traces. Most modern LLM APIs return structured tool calls natively, but you still need to handle:

- Malformed tool calls (invalid JSON in arguments)
- Multiple tool calls in one response (parallel tool use)
- Mixed content (text + tool calls in the same response)
- Refusals or off-topic responses

A robust output parser is a guardrail. When parsing fails, the agent should retry with a clear error message rather than crashing.

---

## 4. Memory Strategies

The context window is the fundamental constraint of agentic systems. Every tool call and result adds to the message history. A 10-step agent with verbose tool outputs can easily consume 50k+ tokens. Memory strategies manage this.

### 4.1 Sliding Window

Keep only the most recent N messages (or N tokens). Older messages are dropped.

```text
[system] [user] ... [assistant] [tool_result] [assistant] [tool_result]
                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                    Only these are kept (e.g., last 20 messages)
```

**Pros:** Simple. Predictable token usage.
**Cons:** The agent forgets earlier work. Can lose critical context from early steps.

### 4.2 Summary Compression

Periodically summarize older messages into a condensed form and replace them.

```text
Before: [sys] [user] [a1] [t1] [a2] [t2] [a3] [t3] [a4] [t4]
After:  [sys] [user] [summary of steps 1-3] [a4] [t4]
```

**Pros:** Retains key information. More efficient than sliding window.
**Cons:** Summarization is lossy — details get dropped. Requires an extra LLM call. The summary itself can be wrong.

### 4.3 RAG-Backed Memory

Store observations and intermediate results in a vector store. The agent queries this store as a tool when it needs to recall past work.

```python
Tool(
    name="recall",
    description="Search memory for past observations related to a query",
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string"}
        },
        "required": ["query"]
    }
)
```

**Pros:** Scales to very long tasks. Agent controls what to remember and when to recall.
**Cons:** Adds retrieval latency. Relevance depends on embedding quality. Agent must learn to use the recall tool effectively.

### 4.4 Hybrid

Combine strategies. A common pattern:

- Keep the last 10 messages in full (sliding window for recency)
- Summarize everything older into a running summary (compression for breadth)
- Store key facts in a structured store that the agent can query (RAG for precision)

Most production agents use some form of hybrid memory. The choice depends on how many steps your agent typically takes and how much context each step generates.

---

## 5. Tool Design

Tools are the agent's interface to the world. Well-designed tools make agents more capable and more reliable. Poorly designed tools cause loops, hallucinations, and failures.

### 5.1 Schema Definition

Every tool needs a clear schema. The schema serves two purposes: it tells the LLM what arguments to provide, and it enables runtime validation.

**Guidelines:**

- **Descriptive names** — `search_codebase` not `search`. The agent sees tool names in context and uses them to decide which tool to call.
- **Detailed descriptions** — explain what the tool does, when to use it, and what it returns. This is part of the prompt.
- **Constrained parameters** — use enums, patterns, and required fields to reduce malformed calls.
- **Few parameters** — each parameter is a decision the LLM must make. Fewer parameters = fewer mistakes.

```python
Tool(
    name="search_codebase",
    description=(
        "Search for files matching a pattern in the codebase. "
        "Returns file paths sorted by relevance. Use this when you need "
        "to find where something is defined or used."
    ),
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search query — a function name, class name, or keyword"
            },
            "file_type": {
                "type": "string",
                "enum": ["py", "js", "ts", "go", "all"],
                "description": "Filter by file extension, or 'all' for any type"
            }
        },
        "required": ["query"]
    }
)
```

### 5.2 Input Validation

Always validate tool inputs before execution. The LLM will sometimes produce arguments that match the schema structurally but are nonsensical (e.g., a path of `"undefined"`, an empty query string).

- Validate against the JSON Schema first (type checking, required fields)
- Apply semantic validation second (does this file path look plausible? is this query non-empty?)
- Return clear error messages that the LLM can use to self-correct

### 5.3 Error Handling

Tools will fail. File not found. API rate limited. Timeout. The agent needs useful error information to recover.

```python
def execute_tool(tool_call, tools):
    try:
        result = tool.run(tool_call.arguments)
        return ToolResult(success=True, output=result)
    except ToolInputError as e:
        return ToolResult(success=False, output=f"Invalid input: {e}")
    except ToolExecutionError as e:
        return ToolResult(success=False, output=f"Execution failed: {e}")
    except TimeoutError:
        return ToolResult(success=False, output="Tool timed out after 30s")
```

**Rules:**

- Never let a tool throw an unhandled exception that crashes the agent loop
- Return errors as tool results so the LLM can reason about them
- Include enough context for the LLM to retry differently (not just "error")
- Distinguish between retryable errors (timeout, rate limit) and permanent errors (invalid path)

### 5.4 Timeouts

Every tool invocation must have a timeout. Without one, a single stuck tool call can hang the entire agent. Typical ranges:

- File operations: 5-10 seconds
- API calls: 10-30 seconds
- Shell commands: 30-120 seconds
- LLM sub-calls (for sub-agents): 60-300 seconds

---

## 6. Evaluation

Evaluating agents is harder than evaluating single LLM calls because the output depends on the trajectory — the sequence of tool calls, not just the final answer.

### 6.1 Trajectory Evaluation

Assess the sequence of actions the agent took.

- **Did it use the right tools?** — A file search agent that never calls the search tool has a trajectory problem.
- **Did it take a reasonable number of steps?** — Completing in 3 steps vs 15 for the same task indicates efficiency.
- **Did it recover from errors?** — An agent that retries sensibly after a tool failure is more robust than one that gives up.

Trajectory eval is typically done by logging the full message history and reviewing it — manually for development, with an LLM-as-judge for CI.

```python
def eval_trajectory(messages, expected_tools, max_steps):
    tools_used = [m.tool_name for m in messages if m.role == "tool_call"]
    assert set(expected_tools).issubset(set(tools_used)), "Missing expected tools"
    assert len(tools_used) <= max_steps, f"Too many steps: {len(tools_used)}"
```

### 6.2 Outcome Evaluation

Assess the final result. Did the agent produce the correct answer or achieve the desired state?

- **Exact match** — for tasks with deterministic answers
- **LLM-as-judge** — for open-ended tasks, use a separate LLM call to evaluate quality
- **State verification** — for tasks that modify state (e.g., "create a file"), verify the state directly

```python
def eval_outcome(result, expected):
    # For deterministic tasks
    assert result.strip() == expected.strip()

    # For open-ended tasks
    judge_response = llm.chat([
        system("You are evaluating an agent's output."),
        user(f"Task: {task}\nExpected: {expected}\nActual: {result}\n"
             f"Score 1-5 on correctness and completeness.")
    ])
    score = parse_score(judge_response)
    assert score >= 4
```

### 6.3 Regression Testing

Build a suite of tasks with known-good trajectories and outcomes. Run the agent against them on every change. Track:

- Pass rate (does the agent still solve tasks it used to solve?)
- Step count (is the agent getting more or less efficient?)
- Cost (are token counts stable?)
- Latency (is end-to-end time reasonable?)

Regression suites should include edge cases: tasks that require error recovery, tasks with ambiguous goals, tasks that need many steps.

---

## 7. Decision Matrix: Choosing a Pattern

| Factor | ReAct | Plan-and-Execute | Reflection |
|---|---|---|---|
| Task complexity | Low to medium | Medium to high | Any |
| Steps known in advance | No | Roughly yes | N/A |
| Auditability need | Medium (reasoning trace) | High (explicit plan) | Medium |
| Latency tolerance | Low (starts immediately) | Higher (planning phase) | Higher (critique pass) |
| Token budget | Moderate | Higher (plan + execution) | Higher (generate + critique) |
| Error recovery | Implicit (next step adapts) | Explicit (replan) | Implicit (revise) |
| Best for | General-purpose agents | Multi-step workflows | Quality-critical output |
| Combine with | Reflection for quality | ReAct within each step | ReAct or Plan-and-Execute |

**Rules of thumb:**

- Start with ReAct. It is the simplest pattern and handles most use cases.
- Add Plan-and-Execute when tasks have 5+ steps and benefit from a visible plan.
- Add Reflection when the agent's output quality is the primary metric (code gen, writing).
- Most production agents combine patterns. Plan-and-Execute at the top level, ReAct within each step, Reflection on the final output.

---

## 8. Security Considerations

Agents execute code, call APIs, and read/write files. The attack surface is large.

### 8.1 Tool Sandboxing

Run tools in a restricted environment. At minimum:

- **File system access** — limit to a specific directory tree. No reading `/etc/passwd`.
- **Network access** — restrict outbound connections to allowlisted domains.
- **Process execution** — if the agent can run shell commands, use containers or seccomp profiles.
- **Resource limits** — CPU time, memory, disk space per tool invocation.

The principle: tools should have the minimum permissions needed to do their job. A "read file" tool should not also be able to write files.

### 8.2 Prompt Injection Defense

An agent that reads external content (files, web pages, API responses) is vulnerable to prompt injection — malicious instructions embedded in data that hijack the agent's behavior.

**Mitigations:**

- **Input tagging** — clearly delimit tool output in the message history so the LLM can distinguish data from instructions. Use structured message roles (tool results are `tool` role, not `user` role).
- **Output filtering** — scan tool results for suspicious patterns before passing them to the LLM (e.g., strings that look like system prompts or tool calls).
- **Instruction hierarchy** — reinforce in the system prompt that tool output is data, not instructions. The system prompt takes precedence over anything in retrieved content.
- **Least privilege** — even if the agent is hijacked, limited tool permissions bound the damage.

No single defense is sufficient. Layer them.

### 8.3 Output Validation

Before the agent's final output reaches the user (or triggers downstream actions), validate it:

- **Schema validation** — if the output should be structured (JSON, YAML), parse and validate it
- **Content filtering** — check for PII, secrets, or inappropriate content that may have leaked from tool results
- **Action confirmation** — for destructive actions (delete, deploy, send), require explicit user approval regardless of what the agent decides

### 8.4 Rate Limiting and Cost Controls

Agents can loop. Without limits, a confused agent will make hundreds of LLM calls and tool invocations, burning money and potentially causing damage.

- **Max iterations** — hard cap on loop iterations (e.g., 25 steps)
- **Max tokens** — budget for total tokens consumed across all LLM calls in a session
- **Max cost** — dollar-denominated cap per session
- **Cooldown** — if the agent makes the same tool call with the same arguments twice in a row, flag it as a potential loop and intervene

---

## 9. Implementation Checklist

When evaluating or extending an agentic template, verify these are addressed:

- [ ] Orchestrator loop with clear termination conditions
- [ ] Tool registry with JSON Schema for every tool
- [ ] Input validation on all tool calls
- [ ] Error handling that returns errors as tool results (no unhandled exceptions)
- [ ] Timeouts on every tool invocation
- [ ] Memory strategy appropriate to expected conversation length
- [ ] System prompt that defines the agent's role, available tools, and constraints
- [ ] Logging of full message history for debugging and evaluation
- [ ] Max iteration / max token / max cost guardrails
- [ ] At least one eval case that tests a full agent run end-to-end
- [ ] Sandboxing strategy for any tools that touch the file system or network
