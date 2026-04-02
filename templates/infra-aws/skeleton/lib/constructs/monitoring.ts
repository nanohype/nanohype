import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";
import type { ApiConstruct } from "./api";

export interface MonitoringConstructProps {
  readonly computeTarget: "lambda" | "ecs";
  readonly lambdaFunction?: lambda.IFunction;
  readonly fargateService?: ecs.FargateService;
  readonly api: ApiConstruct;
}

/**
 * Monitoring construct for __PROJECT_NAME__.
 *
 * Creates a CloudWatch dashboard with key metrics, alarms for error
 * rate and latency thresholds, and an SNS topic for alarm notifications.
 *
 * Lambda metrics: invocations, errors, duration, throttles.
 * ECS metrics: CPU utilization, memory utilization, request count.
 */
export class MonitoringConstruct extends Construct {
  public readonly dashboard: cloudwatch.Dashboard;
  public readonly alarmTopic: sns.Topic;

  constructor(
    scope: Construct,
    id: string,
    props: MonitoringConstructProps
  ) {
    super(scope, id);

    this.alarmTopic = new sns.Topic(this, "AlarmTopic", {
      topicName: "__PROJECT_NAME__-alarms",
      displayName: "__PROJECT_NAME__ Alarm Notifications",
    });

    this.dashboard = new cloudwatch.Dashboard(this, "Dashboard", {
      dashboardName: "__PROJECT_NAME__-dashboard",
    });

    if (props.computeTarget === "lambda" && props.lambdaFunction) {
      this.addLambdaMonitoring(props.lambdaFunction);
    } else if (props.computeTarget === "ecs" && props.fargateService) {
      this.addEcsMonitoring(props.fargateService);
    }

    if (props.api.apiGateway) {
      this.addApiGatewayMonitoring(props.api.apiGateway);
    }
  }

  private addLambdaMonitoring(fn: lambda.IFunction): void {
    const invocations = fn.metricInvocations({ period: cdk.Duration.minutes(5) });
    const errors = fn.metricErrors({ period: cdk.Duration.minutes(5) });
    const duration = fn.metricDuration({ period: cdk.Duration.minutes(5) });
    const throttles = fn.metricThrottles({ period: cdk.Duration.minutes(5) });

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Lambda Invocations & Errors",
        left: [invocations],
        right: [errors],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: "Lambda Duration & Throttles",
        left: [duration],
        right: [throttles],
        width: 12,
      })
    );

    // Error rate alarm — triggers when errors exceed 1% of invocations
    const errorRateAlarm = new cloudwatch.Alarm(this, "ErrorRateAlarm", {
      alarmName: "__PROJECT_NAME__-error-rate",
      alarmDescription: "Lambda error rate exceeds 1%",
      metric: new cloudwatch.MathExpression({
        expression: "(errors / invocations) * 100",
        usingMetrics: {
          errors: fn.metricErrors({ period: cdk.Duration.minutes(5) }),
          invocations: fn.metricInvocations({ period: cdk.Duration.minutes(5) }),
        },
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 3,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    errorRateAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.alarmTopic)
    );

    // P99 latency alarm
    const latencyAlarm = new cloudwatch.Alarm(this, "P99LatencyAlarm", {
      alarmName: "__PROJECT_NAME__-p99-latency",
      alarmDescription: "Lambda p99 duration exceeds 5 seconds",
      metric: fn.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: "p99",
      }),
      threshold: 5000,
      evaluationPeriods: 3,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    latencyAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.alarmTopic)
    );
  }

  private addEcsMonitoring(service: ecs.FargateService): void {
    const cpuUtilization = service.metricCpuUtilization({
      period: cdk.Duration.minutes(5),
    });
    const memoryUtilization = service.metricMemoryUtilization({
      period: cdk.Duration.minutes(5),
    });

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "ECS CPU Utilization",
        left: [cpuUtilization],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: "ECS Memory Utilization",
        left: [memoryUtilization],
        width: 12,
      })
    );

    // CPU alarm
    const cpuAlarm = new cloudwatch.Alarm(this, "CpuAlarm", {
      alarmName: "__PROJECT_NAME__-cpu-utilization",
      alarmDescription: "ECS CPU utilization exceeds 80%",
      metric: cpuUtilization,
      threshold: 80,
      evaluationPeriods: 3,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    cpuAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.alarmTopic)
    );

    // Memory alarm
    const memoryAlarm = new cloudwatch.Alarm(this, "MemoryAlarm", {
      alarmName: "__PROJECT_NAME__-memory-utilization",
      alarmDescription: "ECS memory utilization exceeds 80%",
      metric: memoryUtilization,
      threshold: 80,
      evaluationPeriods: 3,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    memoryAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.alarmTopic)
    );
  }

  private addApiGatewayMonitoring(
    api: cdk.aws_apigateway.RestApi
  ): void {
    const count5xx = api.metricServerError({
      period: cdk.Duration.minutes(5),
    });

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "API Gateway 5xx Errors",
        left: [count5xx],
        width: 12,
      })
    );

    // 5xx alarm
    const serverErrorAlarm = new cloudwatch.Alarm(this, "5xxAlarm", {
      alarmName: "__PROJECT_NAME__-5xx-errors",
      alarmDescription: "API Gateway 5xx error count exceeds threshold",
      metric: count5xx,
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    serverErrorAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.alarmTopic)
    );
  }
}
