from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import networkx as nx
import numpy as np
from scipy import linalg
import random

app = Flask(__name__)
CORS(app)


# ── Graph builder ─────────────────────────────────────────────────────────────

def build_graph(net_type: str, n: int = 35) -> nx.Graph:
    if net_type == "cluster":
        G = nx.powerlaw_cluster_graph(n, 4, 0.5)
    elif net_type == "ring":
        G = nx.watts_strogatz_graph(n, 4, 0.15)
    else:
        G = nx.erdos_renyi_graph(n, 0.1)
    for node in list(nx.isolates(G)):
        target = random.choice([v for v in G.nodes() if v != node])
        G.add_edge(node, target)
    return G


def graph_to_positions(G: nx.Graph, width=700, height=400):
    pos = nx.spring_layout(G, seed=42, k=2.5 / (len(G) ** 0.5))
    nodes = []
    for node, (x, y) in pos.items():
        nodes.append({
            "id":       node,
            "x":        round((x + 1) / 2 * (width  - 80) + 40, 2),
            "y":        round((y + 1) / 2 * (height - 80) + 40, 2),
            "state":    "I" if node == len(G) // 2 else "S",
            "isolated": False,
            "degree":   G.degree(node),
        })
    edges = [{"source": u, "target": v} for u, v in G.edges()]
    return nodes, edges


# ── Markov matrix & steady-state ──────────────────────────────────────────────

def compute_markov(beta: float, gamma: float, avg_degree: float):
    k     = max(1, round(avg_degree * 0.3))
    p_inf = 1 - (1 - beta) ** k
    P = np.array([
        [1 - p_inf, p_inf,       0.0  ],
        [0.0,       1 - gamma,   gamma],
        [0.0,       0.0,         1.0  ],
    ])
    eigenvalues, eigenvectors = linalg.eig(P.T)
    idx = np.argmin(np.abs(eigenvalues - 1.0))
    pi  = np.real(eigenvectors[:, idx])
    pi  = np.abs(pi) / np.sum(np.abs(pi))
    r0  = beta / gamma
    return {
        "matrix": [[round(v, 3) for v in row] for row in P.tolist()],
        "p_inf":  round(float(p_inf), 3),
        "steady_state": {
            "S": round(float(pi[0]), 3),
            "I": round(float(pi[1]), 3),
            "R": round(float(pi[2]), 3),
        },
        "r0":   round(r0, 3),
        "herd": round(max(0.0, 1 - 1 / r0) * 100, 1) if r0 > 1 else 0.0,
    }


# ── Monte Carlo AI vaccine advisor ────────────────────────────────────────────

def monte_carlo_vaccinate(nodes, edges, beta, gamma, n_trials=300, top_k=6):
    adj = {n["id"]: [] for n in nodes}
    for e in edges:
        adj[e["source"]].append(e["target"])
        adj[e["target"]].append(e["source"])

    susceptible = [n for n in nodes if n["state"] == "S" and not n["isolated"]]
    if not susceptible:
        return {"suggested": [], "baseline_recovered": 0,
                "r0": round(beta / gamma, 2), "herd_threshold_pct": 0,
                "needed": 0, "trials": n_trials}

    def run_sim(vaccinated_id=None):
        states = {n["id"]: n["state"] for n in nodes}
        if vaccinated_id is not None:
            states[vaccinated_id] = "V"
        for _ in range(100):
            new_states = dict(states)
            for nid, state in states.items():
                if state == "S":
                    inf_n = sum(1 for nb in adj[nid] if states[nb] == "I")
                    if inf_n > 0 and random.random() < 1 - (1 - beta) ** inf_n:
                        new_states[nid] = "I"
                elif state == "I":
                    if random.random() < gamma:
                        new_states[nid] = "R"
            states = new_states
            if not any(s == "I" for s in states.values()):
                break
        return sum(1 for s in states.values() if s == "R")

    baseline = float(np.mean([run_sim() for _ in range(50)]))
    scores   = {}
    for n in susceptible:
        nid = n["id"]
        avg = float(np.mean([run_sim(nid) for _ in range(n_trials)]))
        scores[nid] = round(baseline - avg, 2)

    sorted_nodes = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    top          = [{"id": nid, "score": sc, "degree": len(adj[nid])}
                    for nid, sc in sorted_nodes[:top_k]]

    r0    = beta / gamma
    herd  = max(0.0, 1 - 1 / r0) if r0 > 1 else 0.0
    return {
        "suggested":           top,
        "baseline_recovered":  round(baseline, 1),
        "r0":                  round(r0, 2),
        "herd_threshold_pct":  round(herd * 100, 1),
        "needed":              int(np.ceil(herd * len(nodes))),
        "trials":              n_trials,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/graph", methods=["POST"])
def api_graph():
    data     = request.json or {}
    G        = build_graph(data.get("net_type", "random"), int(data.get("n", 35)))
    nodes, edges = graph_to_positions(G)
    avg_deg  = sum(d for _, d in G.degree()) / len(G)
    markov   = compute_markov(float(data.get("beta", 0.3)),
                               float(data.get("gamma", 0.1)), avg_deg)
    return jsonify({"nodes": nodes, "edges": edges,
                    "markov": markov, "avg_degree": round(avg_deg, 2)})


@app.route("/api/markov", methods=["POST"])
def api_markov():
    data = request.json or {}
    return jsonify(compute_markov(float(data.get("beta", 0.3)),
                                   float(data.get("gamma", 0.1)),
                                   float(data.get("avg_degree", 3.0))))


@app.route("/api/ai_suggest", methods=["POST"])
def api_ai_suggest():
    data = request.json or {}
    return jsonify(monte_carlo_vaccinate(
        nodes    = data["nodes"],
        edges    = data["edges"],
        beta     = float(data.get("beta",    0.3)),
        gamma    = float(data.get("gamma",   0.1)),
        n_trials = int(data.get("trials",    300)),
        top_k    = int(data.get("top_k",     6)),
    ))


if __name__ == "__main__":
    app.run(debug=True, port=5000)

