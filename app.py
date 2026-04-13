from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import networkx as nx
import numpy as np
from scipy import linalg
import random
import math

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
        candidates = [v for v in G.nodes() if v != node]
        if candidates:
            G.add_edge(node, random.choice(candidates))
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


# ── Markov analysis ───────────────────────────────────────────────────────────

def compute_markov(beta: float, gamma: float, avg_degree: float, delta: float = 0.05):
    """
    SIR Markov chain (3x3 core matrix).
    SIRD extension: delta (death rate) is folded into P(I->I) = 1 - gamma - delta.
    This keeps the matrix stochastic (rows sum to 1) while accounting for deaths.
    """
    k     = max(1, round(avg_degree * 0.3))
    p_inf = round(float(1 - (1 - beta) ** k), 4)
    p_rec = round(float(gamma), 4)
    p_die = round(float(delta), 4)
    p_ii  = round(max(0.0, 1.0 - p_rec - p_die), 4)

    # Ensure rows sum to exactly 1.0
    p_ss  = round(1.0 - p_inf, 4)

    P = np.array([
        [p_ss,  p_inf, 0.0  ],
        [0.0,   p_ii,  p_rec],
        [0.0,   0.0,   1.0  ],
    ])

    # Row-stochastic check — fix floating point drift
    P[0, 0] = 1.0 - P[0, 1]
    P[1, 1] = 1.0 - P[1, 2]

    # Steady-state via eigenvalue decomposition: P^T * pi = pi
    eigenvalues, eigenvectors = linalg.eig(P.T)
    idx = np.argmin(np.abs(eigenvalues - 1.0))
    pi  = np.real(eigenvectors[:, idx])
    pi  = np.abs(pi) / np.sum(np.abs(pi))

    # t-step matrices P^t
    t_steps = {}
    for t in [1, 5, 10, 20]:
        Pt = np.linalg.matrix_power(P, t)
        t_steps[str(t)] = [[round(float(v), 4) for v in row] for row in Pt.tolist()]

    # Distribution evolution: pi^T * P^t for t = 0..79
    dist_evolution = []
    pi0 = np.array([1.0, 0.0, 0.0])
    for t in range(80):
        Pt   = np.linalg.matrix_power(P, t)
        dist = pi0 @ Pt
        dist_evolution.append([round(float(v), 4) for v in dist])

    r0      = round(beta / gamma, 4) if gamma > 0 else 99.0
    herd    = round(max(0.0, 1 - 1 / r0) * 100, 2) if r0 > 1 else 0.0
    exp_ext = round(1 / gamma, 1) if gamma > 0 else 999.0
    row_sums = [round(float(sum(row)), 4) for row in P.tolist()]

    return {
        "matrix":          [[round(float(v), 4) for v in row] for row in P.tolist()],
        "p_inf":           p_inf,
        "p_rec":           p_rec,
        "p_die":           p_die,
        "p_ii":            p_ii,
        "steady_state":    {"S": round(float(pi[0]), 4),
                            "I": round(float(pi[1]), 4),
                            "R": round(float(pi[2]), 4)},
        "t_step_matrices": t_steps,
        "dist_evolution":  dist_evolution,
        "r0":              r0,
        "herd":            herd,
        "exp_extinction":  exp_ext,
        "row_sums":        row_sums,
        "avg_degree":      round(avg_degree, 2),
    }


# ── Monte Carlo AI vaccination advisor ───────────────────────────────────────

def monte_carlo_vaccinate(nodes, edges, beta, gamma, delta=0.05, n_trials=300, top_k=6):
    adj = {n["id"]: [] for n in nodes}
    for e in edges:
        adj[e["source"]].append(e["target"])
        adj[e["target"]].append(e["source"])

    susceptible = [n for n in nodes if n["state"] == "S" and not n["isolated"]]
    if not susceptible:
        return {"suggested": [], "baseline_recovered": 0, "baseline_dead": 0,
                "r0": round(beta / gamma, 2) if gamma > 0 else 99,
                "herd_threshold_pct": 0, "needed": 0, "trials": n_trials}

    def run_sim(vaccinated_id=None):
        states = {n["id"]: n["state"] for n in nodes}
        if vaccinated_id is not None:
            states[vaccinated_id] = "V"
        for _ in range(120):
            new_states = dict(states)
            for nid, state in states.items():
                if state == "S":
                    inf_n = sum(1 for nb in adj[nid] if states[nb] == "I")
                    if inf_n > 0 and random.random() < 1 - (1 - beta) ** inf_n:
                        new_states[nid] = "I"
                elif state == "I":
                    r = random.random()
                    if r < gamma:
                        new_states[nid] = "R"
                    elif r < gamma + delta:
                        new_states[nid] = "D"
            states = new_states
            if not any(s == "I" for s in states.values()):
                break
        return (sum(1 for s in states.values() if s == "R"),
                sum(1 for s in states.values() if s == "D"))

    baseline_results = [run_sim() for _ in range(50)]
    baseline_rec  = float(np.mean([r for r, _ in baseline_results]))
    baseline_dead = float(np.mean([d for _, d in baseline_results]))

    scores = {}
    for n in susceptible:
        nid     = n["id"]
        results = [run_sim(nid) for _ in range(n_trials)]
        avg_rec  = float(np.mean([r for r, _ in results]))
        avg_dead = float(np.mean([d for _, d in results]))
        scores[nid] = round((baseline_rec - avg_rec) + (baseline_dead - avg_dead), 2)

    sorted_nodes = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    top = [{"id": nid, "score": sc, "degree": len(adj[nid])}
           for nid, sc in sorted_nodes[:top_k]]

    r0   = beta / gamma if gamma > 0 else 99
    herd = max(0.0, 1 - 1 / r0) if r0 > 1 else 0.0

    return {
        "suggested":          top,
        "baseline_recovered": round(baseline_rec, 1),
        "baseline_dead":      round(baseline_dead, 1),
        "r0":                 round(r0, 2),
        "herd_threshold_pct": round(herd * 100, 1),
        "needed":             int(math.ceil(herd * len(nodes))),
        "trials":             n_trials,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/graph", methods=["POST"])
def api_graph():
    data    = request.json or {}
    G       = build_graph(data.get("net_type", "random"), int(data.get("n", 35)))
    nodes, edges = graph_to_positions(G)
    avg_deg = sum(d for _, d in G.degree()) / len(G)
    markov  = compute_markov(
        float(data.get("beta",  0.3)),
        float(data.get("gamma", 0.1)),
        avg_deg,
        float(data.get("delta", 0.05)),
    )
    return jsonify({"nodes": nodes, "edges": edges,
                    "markov": markov, "avg_degree": round(avg_deg, 2)})


@app.route("/api/markov", methods=["POST"])
def api_markov():
    data = request.json or {}
    return jsonify(compute_markov(
        float(data.get("beta",       0.3)),
        float(data.get("gamma",      0.1)),
        float(data.get("avg_degree", 3.0)),
        float(data.get("delta",      0.05)),
    ))


@app.route("/api/ai_suggest", methods=["POST"])
def api_ai_suggest():
    data = request.json or {}
    return jsonify(monte_carlo_vaccinate(
        nodes    = data["nodes"],
        edges    = data["edges"],
        beta     = float(data.get("beta",    0.3)),
        gamma    = float(data.get("gamma",   0.1)),
        delta    = float(data.get("delta",   0.05)),
        n_trials = int(data.get("trials",    300)),
        top_k    = int(data.get("top_k",     6)),
    ))


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app.run(debug=True, port=5000)
