{{/* vim: set filetype=mustache: */}}

{{/*
Expand the name of the chart.
*/}}
{{- define "__PROJECT_NAME__.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "__PROJECT_NAME__.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "__PROJECT_NAME__.labels" -}}
helm.sh/chart: {{ include "__PROJECT_NAME__.name" . }}-{{ .Chart.Version | replace "+" "_" }}
{{ include "__PROJECT_NAME__.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "__PROJECT_NAME__.selectorLabels" -}}
app.kubernetes.io/name: {{ include "__PROJECT_NAME__.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Component name helper.
*/}}
{{- define "__PROJECT_NAME__.componentName" -}}
{{- $component := index . 0 -}}
{{- $ctx := index . 1 -}}
{{- printf "%s-%s" (include "__PROJECT_NAME__.fullname" $ctx) $component }}
{{- end }}

{{/*
Component labels.
*/}}
{{- define "__PROJECT_NAME__.componentLabels" -}}
{{- $component := index . 0 -}}
{{- $ctx := index . 1 -}}
{{ include "__PROJECT_NAME__.labels" $ctx }}
app.kubernetes.io/component: {{ $component }}
{{- end }}

{{/*
Component selector labels.
*/}}
{{- define "__PROJECT_NAME__.componentSelectorLabels" -}}
{{- $component := index . 0 -}}
{{- $ctx := index . 1 -}}
{{ include "__PROJECT_NAME__.selectorLabels" $ctx }}
app.kubernetes.io/component: {{ $component }}
{{- end }}
