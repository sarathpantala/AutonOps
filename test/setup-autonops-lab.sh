#!/bin/bash

set -e

CLUSTER_NAME="autonops-lab"
NAMESPACE="autonops"
KUBECONFIG_FILE="./kubeconfig-autonops.yaml"
KIND_CONFIG="kind-config.yaml"

echo "🚀 Setting up AutonOps Local SRE Lab..."

# ----------------------------
# 1. CREATE KIND CONFIG (MULTI NODE)
# ----------------------------
echo "📄 Creating kind config..."

cat <<EOF > $KIND_CONFIG
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: ${CLUSTER_NAME}
nodes:
  - role: control-plane
  - role: worker
  - role: worker
  - role: worker
  - role: worker
EOF

# ----------------------------
# 2. CREATE CLUSTER
# ----------------------------
echo "📦 Creating Kubernetes cluster..."

kind create cluster --config $KIND_CONFIG || echo "Cluster already exists"

kubectl cluster-info

# ----------------------------
# 3. REMOVE CONTROL-PLANE TAINT (IMPORTANT FOR LAB)
# ----------------------------
echo "⚙️ Removing control-plane taint..."
kubectl taint nodes --all node-role.kubernetes.io/control-plane- || true

# ----------------------------
# 4. EXPORT KUBECONFIG
# ----------------------------
echo "🔐 Exporting kubeconfig..."

kind get kubeconfig --name $CLUSTER_NAME > $KUBECONFIG_FILE
sed -i.bak 's/127.0.0.1/localhost/g' $KUBECONFIG_FILE || true

echo "✅ kubeconfig saved: $KUBECONFIG_FILE"

# ----------------------------
# 5. CREATE NAMESPACE
# ----------------------------
kubectl --kubeconfig=$KUBECONFIG_FILE create namespace $NAMESPACE || true

# ----------------------------
# 6. METRICS SERVER
# ----------------------------
echo "📊 Installing Metrics Server..."

kubectl --kubeconfig=$KUBECONFIG_FILE apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

kubectl --kubeconfig=$KUBECONFIG_FILE patch deployment metrics-server -n kube-system \
  --type='json' \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]' || true

sleep 5

# ----------------------------
# 7. PROMETHEUS
# ----------------------------
echo "📈 Installing Prometheus..."

kubectl --kubeconfig=$KUBECONFIG_FILE apply -n $NAMESPACE -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
data:
  prometheus.yml: |
    global:
      scrape_interval: 5s

    scrape_configs:
      - job_name: 'kubernetes-pods'
        kubernetes_sd_configs:
          - role: pod
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      containers:
      - name: prometheus
        image: prom/prometheus:v2.51.0
        args:
          - "--config.file=/etc/prometheus/prometheus.yml"
        ports:
          - containerPort: 9090
        volumeMounts:
          - name: config
            mountPath: /etc/prometheus
      volumes:
        - name: config
          configMap:
            name: prometheus-config
---
apiVersion: v1
kind: Service
metadata:
  name: prometheus
spec:
  selector:
    app: prometheus
  ports:
    - port: 9090
      targetPort: 9090
EOF

# ----------------------------
# 8. TEST APPS
# ----------------------------
echo "🔥 Deploying test apps..."

kubectl --kubeconfig=$KUBECONFIG_FILE apply -n $NAMESPACE -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: payments
  template:
    metadata:
      labels:
        app: payments
    spec:
      containers:
      - name: payments
        image: busybox
        command: ["sh", "-c"]
        args:
          - while true; do echo "Processing payment..."; dd if=/dev/zero of=/dev/null; sleep 1; done
        resources:
          requests:
            cpu: "50m"
          limits:
            cpu: "100m"
---
apiVersion: v1
kind: Service
metadata:
  name: payments-api
spec:
  selector:
    app: payments
  ports:
    - port: 80
      targetPort: 80
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
spec:
  replicas: 2
  selector:
    matchLabels:
      app: auth
  template:
    metadata:
      labels:
        app: auth
    spec:
      containers:
      - name: auth
        image: busybox
        command: ["sh", "-c"]
        args:
          - while true; do echo "Auth..."; sleep 2; exit 1; done
EOF

# ----------------------------
# 9. LOAD GENERATOR
# ----------------------------
echo "⚡ Deploying load generator..."

kubectl --kubeconfig=$KUBECONFIG_FILE apply -n $NAMESPACE -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: load-generator
spec:
  replicas: 1
  selector:
    matchLabels:
      app: load
  template:
    metadata:
      labels:
        app: load
    spec:
      containers:
      - name: load
        image: busybox
        command: ["sh", "-c"]
        args:
          - while true; do wget -q -O- payments-api; sleep 0.2; done
EOF

# ----------------------------
# 10. WAIT
# ----------------------------
echo "⏳ Waiting for pods..."
sleep 10
kubectl --kubeconfig=$KUBECONFIG_FILE get pods -n $NAMESPACE

# ----------------------------
# 11. PORT FORWARD
# ----------------------------
echo "🌐 Starting Prometheus..."

pkill -f "kubectl port-forward" || true

kubectl --kubeconfig=$KUBECONFIG_FILE port-forward -n $NAMESPACE svc/prometheus 9090:9090 > /dev/null 2>&1 &

sleep 2

# ----------------------------
# DONE
# ----------------------------
echo ""
echo "✅ AutonOps Lab Ready!"
echo ""
echo "📁 Kubeconfig: $KUBECONFIG_FILE"
echo "📊 Prometheus: http://localhost:9090"
echo ""
echo "kubectl --kubeconfig=$KUBECONFIG_FILE get nodes"
echo ""