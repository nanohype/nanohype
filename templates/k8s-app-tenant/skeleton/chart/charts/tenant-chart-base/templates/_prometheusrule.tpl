{{/*
PrometheusRule: the CR scaffold + alert groups. Set `prometheusRule.groups` to
supply the app's real SLOs; left unset, it ships one example RED alert keyed on
the app's metric prefix (service.name with dashes → underscores per the
OTLP→Prometheus convention). The dash→underscore conversion is why the default
lives here and not in values.

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
  {{- else }}
  groups:
    - name: {{ $name }}.red
      interval: 1m
      rules:
        - alert: {{ $name | title | nospace }}HighErrorRate
          # Error ratio over 5m exceeds 5%. Replace with the app's real SLOs.
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
