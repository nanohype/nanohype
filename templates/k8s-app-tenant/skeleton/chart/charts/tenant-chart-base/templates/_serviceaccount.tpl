{{/*
ServiceAccount for the tenant's pods. Its AWS identity is bound out of band by
an EKS Pod Identity association (namespace + ServiceAccount -> IAM role) created
by landing-zone's <app>-platform component, so the pod assumes its role without
any role-arn annotation and no inline IAM is defined here. The ServiceAccount
name must match the association's `service_account`, so set `serviceAccount.name`
to the app name (see values.yaml).

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
