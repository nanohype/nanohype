{{/*
ServiceAccount for the tenant's pods. The operator creates and owns the
`tenant-runtime` ServiceAccount in the workload namespace and binds it to the
per-Platform IAM role with an EKS Pod Identity association, so the pod assumes
its role with no role-arn annotation and no inline IAM here. The chart therefore
references that SA (serviceAccount.create: false, name: tenant-runtime) rather
than minting its own — an SA the chart created would get no association and no
credentials. This partial renders a chart-owned SA only if serviceAccount.create
is set true (an externally-managed-association escape hatch), and is inert
otherwise.

Usage (consumer templates/serviceaccount.yaml):
  {{ include "tenant-chart-base.serviceaccount" . }}
*/}}
{{- define "tenant-chart-base.serviceaccount" -}}
{{- if .Values.serviceAccount.create }}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ include "tenant-chart-base.serviceAccountName" . }}
  labels:
    {{- include "tenant-chart-base.labels" . | nindent 4 }}
  {{- with .Values.serviceAccount.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
{{- end }}
{{- end -}}
