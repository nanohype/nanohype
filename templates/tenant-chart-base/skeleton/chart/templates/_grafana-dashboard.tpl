{{/*
Grafana dashboard ConfigMap, discovered by the Grafana sidecar via the
`grafana_dashboard` label. The JSON is loaded verbatim from the consumer's
chart/dashboards/<name>.json (filename derived from the chart name) — edit that
file, not this template.

Usage (consumer templates/grafana-dashboard.yaml):
  {{ include "tenant-chart-base.grafanaDashboard" . }}
*/}}
{{- define "tenant-chart-base.grafanaDashboard" -}}
{{- if .Values.grafanaDashboard.enabled }}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "tenant-chart-base.fullname" . }}-dashboard
  labels:
    {{- include "tenant-chart-base.labels" . | nindent 4 }}
    grafana_dashboard: "1"
data:
  {{ include "tenant-chart-base.name" . }}.json: |-
    {{- .Files.Get (printf "dashboards/%s.json" (include "tenant-chart-base.name" .)) | nindent 4 }}
{{- end }}
{{- end -}}
