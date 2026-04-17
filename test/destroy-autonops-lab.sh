#!/bin/bash

set -e

CLUSTER_NAME="autonops-lab"
NAMESPACE="autonops"

echo "💥 Destroying AutonOps Lab completely..."

# ----------------------------
# 1. STOP PORT-FORWARDS
# ----------------------------
echo "🔌 Stopping port-forwards..."
pkill -f "kubectl port-forward" || true

# ----------------------------
# 2. DELETE NAMESPACE (APPS + PROMETHEUS)
# ----------------------------
echo "🗑️ Deleting namespace: $NAMESPACE"
kubectl delete namespace $NAMESPACE --ignore-not-found

echo "⏳ Waiting for namespace cleanup..."
kubectl wait --for=delete namespace/$NAMESPACE --timeout=60s || true

# ----------------------------
# 3. REMOVE METRICS SERVER (CLUSTER LEVEL)
# ----------------------------
echo "📊 Removing Metrics Server..."
kubectl delete -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml || true

# ----------------------------
# 4. DELETE KIND CLUSTER (FULL CLEAN)
# ----------------------------
echo "💣 Deleting kind cluster..."
kind delete cluster --name $CLUSTER_NAME || true

# ----------------------------
# 5. CLEAN LOCAL KUBECONFIG (OPTIONAL)
# ----------------------------
echo "🧹 Cleaning kube context..."
kubectl config delete-context kind-$CLUSTER_NAME 2>/dev/null || true
kubectl config delete-cluster kind-$CLUSTER_NAME 2>/dev/null || true

# ----------------------------
# DONE
# ----------------------------
echo ""
echo "✅ AutonOps Lab completely destroyed."
echo ""