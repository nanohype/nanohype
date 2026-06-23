{{/*
GrafanaDashboard CR (grafana.integreatly.org/v1beta1), reconciled by the
grafana-operator onto the org's external Amazon Managed Grafana — the same
delivery path the platform's authored dashboards use. The operator runs in both
the EKS clusters and the local kx kind cluster, so this CR is the portable
choice (a ConfigMap+sidecar only works where kube-prometheus-stack runs).

`instanceSelector` matches the `external` Grafana; `allowCrossNamespaceImport`
lets a tenant-namespace dashboard reach that cluster-scoped instance. The JSON is
loaded verbatim from the consumer's chart/dashboards/<name>.json (filename derived
from the chart name) — edit that file, not this template. The board is
self-contained (inline SLO/burn PromQL), so it renders against AMP without any
recording-rule ruler.

Usage (consumer templates/grafana-dashboard.yaml):
  {{ include "tenant-chart-base.grafanaDashboard" . }}
*/}}
{{- define "tenant-chart-base.grafanaDashboard" -}}
{{- if .Values.grafanaDashboard.enabled }}
apiVersion: grafana.integreatly.org/v1beta1
kind: GrafanaDashboard
metadata:
  name: {{ include "tenant-chart-base.fullname" . }}
  labels:
    {{- include "tenant-chart-base.labels" . | nindent 4 }}
spec:
  instanceSelector:
    matchLabels:
      {{- toYaml .Values.grafanaDashboard.instanceSelector | nindent 6 }}
  allowCrossNamespaceImport: {{ .Values.grafanaDashboard.allowCrossNamespaceImport }}
  resyncPeriod: {{ .Values.grafanaDashboard.resyncPeriod }}
  json: |
    {{- .Files.Get (printf "dashboards/%s.json" (include "tenant-chart-base.name" .)) | nindent 4 }}
{{- end }}
{{- end -}}
