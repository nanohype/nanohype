{{/*
PrometheusRule: the CR scaffold + alert groups supplied per-app via
`.Values.prometheusRule.groups` (each app's SLOs differ). The OTel metrics the
app emits arrive in Mimir with service.name as the metric prefix (dashes →
underscores per the OTLP→Prometheus convention).

Usage (consumer templates/prometheusrule.yaml):
  {{ include "tenant-chart-base.prometheusrule" . }}
*/}}
{{- define "tenant-chart-base.prometheusrule" -}}
{{- if .Values.prometheusRule.enabled }}
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
  groups:
    {{- toYaml .Values.prometheusRule.groups | nindent 4 }}
{{- end }}
{{- end -}}
