#!/usr/bin/env bash
# Scaffold-variable defaults for `make verify` runs. Keep these conservative:
# every value here is meant to be a benign placeholder that lets the template
# render and compile/validate. Real users bring their own values at scaffold
# time.

# Returns a bash array of `--var Key=Value` arguments for the given template
# or composite name via stdout, one per line. Callers read with mapfile.
#
# Unknown names emit nothing and return 0 — the caller decides whether to
# treat that as an error or just pass no defaults.
scaffold_defaults_for() {
  local name="$1"
  case "$name" in
    # ── Service templates ──────────────────────────────────────────────
    go-service)
      cat <<'EOF'
--var
ProjectName=nanohype-verify
--var
Org=nanohype
--var
GoModule=github.com/nanohype/nanohype-verify
--var
IncludeAuth=false
--var
IncludeDocker=true
EOF
      ;;

    spring-boot-service)
      cat <<'EOF'
--var
ProjectName=nanohype-verify
--var
GroupId=com.nanohype.verify
--var
ArtifactId=nanohype-verify
--var
JavaPackage=com.nanohype.verify.app
--var
PackageDir=com/nanohype/verify/app
--var
IncludeAuth=false
--var
IncludeDocker=true
EOF
      ;;

    # ── Auth module ────────────────────────────────────────────────────
    module-spring-security)
      cat <<'EOF'
--var
ProjectName=nanohype-verify
--var
JavaPackage=com.nanohype.verify.app
--var
PackageDir=com/nanohype/verify/app
--var
OidcIssuer=https://auth.example.com
--var
AllowedAudience=nanohype-verify
--var
IncludeMethodSecurity=true
--var
IncludeTests=true
EOF
      ;;

    # ── Istio policy ───────────────────────────────────────────────────
    istio-policy)
      cat <<'EOF'
--var
ProjectName=nanohype-verify
--var
Namespace=apps
--var
OidcIssuer=https://auth.example.com
--var
AllowedAudience=nanohype-verify
--var
IncludeMTls=false
--var
IncludeVirtualService=true
--var
GatewayName=mesh
EOF
      ;;

    # ── K8s deploy ─────────────────────────────────────────────────────
    k8s-deploy)
      cat <<'EOF'
--var
ProjectName=nanohype-verify
--var
Namespace=apps
--var
Replicas=2
--var
IncludeIngress=true
--var
IncludeHpa=true
--var
IncludeHelm=true
--var
IncludeCi=true
EOF
      ;;

    # ── Monitoring stack ───────────────────────────────────────────────
    monitoring-stack)
      cat <<'EOF'
--var
ProjectName=nanohype-verify
--var
DeployTarget=kubernetes
--var
IncludeAlerts=true
EOF
      ;;

    # ── Composites ─────────────────────────────────────────────────────
    spring-boot-microservice)
      cat <<'EOF'
--var
ProjectName=nanohype-verify
--var
GroupId=com.nanohype.verify
--var
JavaPackage=com.nanohype.verify.app
--var
PackageDir=com/nanohype/verify/app
--var
Namespace=apps
--var
IncludeMonitoring=false
EOF
      ;;
    identity-aware-service)
      cat <<'EOF'
--var
ProjectName=nanohype-verify
--var
GroupId=com.nanohype.verify
--var
JavaPackage=com.nanohype.verify.app
--var
PackageDir=com/nanohype/verify/app
--var
Namespace=apps
--var
OidcIssuer=https://auth.example.com
--var
AllowedAudience=nanohype-verify
--var
IncludeMTls=false
--var
IncludeMonitoring=false
EOF
      ;;

    *)
      # No known defaults — caller handles.
      return 0
      ;;
  esac
}

# Maps a template/composite name to the flavor its cluster-side validations
# run against. Names without cluster concerns return empty string — the
# verify orchestrator interprets that as "skip cluster validation."
default_flavor_for() {
  case "$1" in
    k8s-deploy|istio-policy)                         echo "istio" ;;
    spring-boot-microservice|identity-aware-service) echo "istio" ;;
    monitoring-stack)                                echo "monitoring" ;;
    spring-boot-service|module-spring-security)      echo "" ;;
    *)                                               echo "" ;;
  esac
}

# Which pre-flight checks run for a given template/composite.
# Space-separated tokens:
#   mvn      — run `mvn verify` in the rendered dir (Java templates)
#   kubectl  — kubectl dry-run-server across the rendered YAML tree
#   istioctl — istioctl analyze on any Istio manifests
#   helm     — helm lint any chart/ directory found
checks_for() {
  case "$1" in
    spring-boot-service)                             echo "mvn" ;;
    module-spring-security)                          echo "" ;;
    istio-policy)                                    echo "kubectl istioctl" ;;
    k8s-deploy)                                      echo "kubectl helm" ;;
    monitoring-stack)                                echo "kubectl helm" ;;
    spring-boot-microservice)                        echo "mvn kubectl helm" ;;
    identity-aware-service)                          echo "mvn kubectl istioctl helm" ;;
    *)                                               echo "" ;;
  esac
}
