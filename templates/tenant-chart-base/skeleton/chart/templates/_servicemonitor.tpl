{{/*
ServiceMonitor for scrape-based apps. Off by default: the baseline tenant pushes
metrics via OTLP to the cluster collector, which is the "equivalent scrape config"
the observability-slo standard accepts — no ServiceMonitor needed there. Enable
this for apps that instead expose a Prometheus `/metrics` endpoint to be scraped
(e.g. a Go service with promhttp, the operator). Add a named `metrics` port to the
Service when you enable it.

The `serviceMonitor.selector` labels must match the Prometheus instance's
serviceMonitorSelector (e.g. `release: kube-prometheus-stack`).

Usage (consumer templates/servicemonitor.yaml):
  {{ include "tenant-chart-base.serviceMonitor" . }}
*/}}
{{- define "tenant-chart-base.serviceMonitor" -}}
{{- if .Values.serviceMonitor.enabled }}
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: {{ include "tenant-chart-base.fullname" . }}
  labels:
    {{- include "tenant-chart-base.labels" . | nindent 4 }}
    {{- with .Values.serviceMonitor.selector }}
    {{- toYaml . | nindent 4 }}
    {{- end }}
spec:
  selector:
    matchLabels:
      {{- include "tenant-chart-base.selectorLabels" . | nindent 6 }}
  namespaceSelector:
    matchNames:
      - {{ .Release.Namespace }}
  endpoints:
    - port: {{ .Values.serviceMonitor.port }}
      path: {{ .Values.serviceMonitor.path }}
      interval: {{ .Values.serviceMonitor.interval }}
      scrapeTimeout: {{ .Values.serviceMonitor.scrapeTimeout }}
{{- end }}
{{- end -}}
