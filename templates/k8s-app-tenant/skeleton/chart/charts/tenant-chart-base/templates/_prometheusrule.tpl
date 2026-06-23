{{/*
PrometheusRule: the CR scaffold + alert groups, per the observability-slo standard.

Three modes, in priority order:
  1. `prometheusRule.groups` set        → emitted verbatim (full manual control).
  2. `slo.enabled` true (the default)   → SLI recording rules over the burn-rate
     windows + multi-window multi-burn-rate error-budget alerts (2 page, 2 ticket),
     keyed on the app's metric prefix (service.name with dashes → underscores per
     the OTLP→Prometheus convention).
  3. neither                            → one example RED alert (back-compat).

The availability SLI defaults to `1 - errors/requests`. Override the objective via
`slo.objective`; supply latency or custom-shaped SLOs via `prometheusRule.groups`.

Usage (consumer templates/prometheusrule.yaml):
  {{ include "tenant-chart-base.prometheusrule" . }}
*/}}
{{- define "tenant-chart-base.prometheusrule" -}}
{{- if .Values.prometheusRule.enabled }}
{{- $name := include "tenant-chart-base.name" . }}
{{- $metric := $name | replace "-" "_" }}
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: {{ include "tenant-chart-base.fullname" . }}
  labels:
    {{- include "tenant-chart-base.labels" . | nindent 4 }}
    {{- with .Values.prometheusRule.selector }}
    {{- toYaml . | nindent 4 }}
    {{- end }}
spec:
  {{- if .Values.prometheusRule.groups }}
  groups:
    {{- toYaml .Values.prometheusRule.groups | nindent 4 }}
  {{- else if .Values.slo.enabled }}
  {{- $obj := .Values.slo.objective }}
  {{- $budget := subf 1.0 $obj }}
  {{- $errExpr := .Values.slo.errorRatioQuery }}
  {{- $windows := list "5m" "30m" "1h" "2h" "6h" "1d" "3d" }}
  {{- $pairs := list
      (dict "name" "Fast"     "sev" "page"   "long" "1h" "short" "5m"  "factor" 14.4 "for" "2m"  "consumed" "2% in 1h")
      (dict "name" "Medium"   "sev" "page"   "long" "6h" "short" "30m" "factor" 6.0  "for" "5m"  "consumed" "5% in 6h")
      (dict "name" "Slow"     "sev" "ticket" "long" "1d" "short" "2h"  "factor" 3.0  "for" "15m" "consumed" "10% in 1d")
      (dict "name" "VerySlow" "sev" "ticket" "long" "3d" "short" "6h"  "factor" 1.0  "for" "1h"  "consumed" "10% in 3d") }}
  groups:
    # SLI recording rules: availability error-ratio over each burn-rate window.
    - name: {{ $name }}.slo.records
      interval: 30s
      rules:
        {{- range $w := $windows }}
        - record: {{ $metric }}:sli_error:ratio_rate{{ $w }}
          expr: |
            {{- if $errExpr }}
            {{ $errExpr | nindent 12 | trim }}
            {{- else }}
            sum(rate({{ $metric }}_errors_total[{{ $w }}]))
              / clamp_min(sum(rate({{ $metric }}_requests_total[{{ $w }}])), 1)
            {{- end }}
        {{- end }}
        # 30d availability SLI and remaining error budget (fraction of budget left).
        - record: {{ $metric }}:sli_availability:ratio30d
          expr: |
            1 - (
              sum(rate({{ $metric }}_errors_total[30d]))
                / clamp_min(sum(rate({{ $metric }}_requests_total[30d])), 1)
            )
        - record: {{ $metric }}:error_budget:ratio30d
          expr: |
            1 - (
              (
                sum(rate({{ $metric }}_errors_total[30d]))
                  / clamp_min(sum(rate({{ $metric }}_requests_total[30d])), 1)
              ) / {{ printf "%.6g" $budget }}
            )
    # Multi-window multi-burn-rate error-budget alerts (objective {{ printf "%.4g" $obj }}).
    - name: {{ $name }}.slo.alerts
      interval: 1m
      rules:
        {{- range $p := $pairs }}
        {{- $threshold := printf "%.5g" (mulf $p.factor $budget) }}
        - alert: {{ $name | replace "-" " " | title | nospace }}ErrorBudgetBurn{{ $p.name }}
          expr: |
            {{ $metric }}:sli_error:ratio_rate{{ $p.long }} > {{ $threshold }}
              and
            {{ $metric }}:sli_error:ratio_rate{{ $p.short }} > {{ $threshold }}
          for: {{ $p.for }}
          labels:
            severity: {{ $p.sev }}
            service: {{ $name }}
          annotations:
            summary: {{ $name }} is burning its error budget ({{ $p.consumed }})
            description: |
              Multi-window burn rate over {{ $p.long }}/{{ $p.short }} exceeds {{ $p.factor }}x
              the {{ printf "%.4g" $obj }} availability objective — error ratio is
              {{ "{{" }} $value | printf "%.4f" {{ "}}" }}. At this rate the 30d budget is gone soon.
              Check recent rollouts, upstream dependency health, and the pod logs.
        {{- end }}
  {{- else }}
  groups:
    - name: {{ $name }}.red
      interval: 1m
      rules:
        - alert: {{ $name | replace "-" " " | title | nospace }}HighErrorRate
          # Error ratio over 5m exceeds 5%. Enable slo.* for the full burn-rate SLOs.
          expr: |
            sum(rate({{ $metric }}_errors_total[5m]))
              / clamp_min(sum(rate({{ $metric }}_requests_total[5m])), 1)
              > 0.05
          for: 10m
          labels:
            severity: page
            service: {{ $name }}
          annotations:
            summary: {{ $name }} error rate above 5% for 10m
            description: |
              Error ratio is {{ "{{" }} $value | printf "%.3f" {{ "}}" }} over the last 5m.
              Check recent rollouts, upstream dependency health, and the pod logs.
  {{- end }}
{{- end }}
{{- end -}}
