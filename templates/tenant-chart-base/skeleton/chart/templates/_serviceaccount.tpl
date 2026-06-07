{{/*
ServiceAccount with the tenant's IRSA role annotation. The role itself is
provisioned by landing-zone's <app>-platform component; this only references its
ARN via `aws.platformRoleArn`. No inline IAM is defined here.

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
  {{- if or .Values.aws.platformRoleArn .Values.serviceAccount.annotations }}
  annotations:
    {{- if .Values.aws.platformRoleArn }}
    eks.amazonaws.com/role-arn: {{ .Values.aws.platformRoleArn | quote }}
    {{- end }}
    {{- with .Values.serviceAccount.annotations }}
    {{- toYaml . | nindent 4 }}
    {{- end }}
  {{- end }}
{{- end }}
{{- end -}}
