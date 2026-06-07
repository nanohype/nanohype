{{/*
Name/label/selector helpers shared by every Platform-tenant chart. These are
included with the CONSUMER's context (`.`), so `.Chart`, `.Release`, and
`.Values` resolve to the consuming app — `tenant-chart-base.name` returns the
app's name, not "tenant-chart-base".
*/}}

{{/*
Expand the name of the chart.
*/}}
{{- define "tenant-chart-base.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Fully qualified app name.
*/}}
{{- define "tenant-chart-base.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Common labels. The tenant/platform labels come from the OTel resource attributes
the consumer sets, falling back to the chart name for the platform.
*/}}
{{- define "tenant-chart-base.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "tenant-chart-base.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
agents.nanohype.dev/tenant: {{ (index .Values.otel.resourceAttributes "agents.tenant") | default "unknown" | quote }}
agents.nanohype.dev/platform: {{ (index .Values.otel.resourceAttributes "agents.platform") | default .Chart.Name | quote }}
{{- end -}}

{{/*
Selector labels.
*/}}
{{- define "tenant-chart-base.selectorLabels" -}}
app.kubernetes.io/name: {{ include "tenant-chart-base.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Service account name.
*/}}
{{- define "tenant-chart-base.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "tenant-chart-base.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}
