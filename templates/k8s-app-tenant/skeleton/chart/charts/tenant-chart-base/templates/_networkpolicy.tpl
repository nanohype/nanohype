{{/*
NetworkPolicy: the CR scaffold + a values-driven ingress and egress allow-list.
Ingress varies by workload topology (single-pod vs api+web vs webhook+processor),
so it's supplied per-app via `.Values.networkPolicy.ingress`; egress is the
consumer's allow-list from `.Values.networkPolicy.egress`.

Usage (consumer templates/networkpolicy.yaml):
  {{ include "tenant-chart-base.networkpolicy" . }}
*/}}
{{- define "tenant-chart-base.networkpolicy" -}}
{{- if .Values.networkPolicy.enabled }}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ include "tenant-chart-base.fullname" . }}
  labels:
    {{- include "tenant-chart-base.labels" . | nindent 4 }}
spec:
  podSelector:
    matchLabels:
      {{- include "tenant-chart-base.selectorLabels" . | nindent 6 }}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    {{- toYaml .Values.networkPolicy.ingress | nindent 4 }}
  egress:
    {{- toYaml .Values.networkPolicy.egress | nindent 4 }}
{{- end }}
{{- end -}}
