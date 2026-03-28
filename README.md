<div align="center">
<br/>
```
██████╗  █████╗ ████████╗██╗███████╗███╗   ██╗████████╗    ███████╗███████╗██████╗  ██████╗
██╔══██╗██╔══██╗╚══██╔══╝██║██╔════╝████╗  ██║╚══██╔══╝    ╚══███╔╝██╔════╝██╔══██╗██╔═══██╗
██████╔╝███████║   ██║   ██║█████╗  ██╔██╗ ██║   ██║         ███╔╝ █████╗  ██████╔╝██║   ██║
██╔═══╝ ██╔══██║   ██║   ██║██╔══╝  ██║╚██╗██║   ██║        ███╔╝  ██╔══╝  ██╔══██╗██║   ██║
██║     ██║  ██║   ██║   ██║███████╗██║ ╚████║   ██║        ███████╗███████╗██║  ██║╚██████╔╝
╚═╝     ╚═╝  ╚═╝   ╚═╝   ╚═╝╚══════╝╚═╝  ╚═══╝   ╚═╝        ╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝
```
Markov Chain Epidemic Simulator with Monte Carlo AI Vaccination Advisor
<br/>
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.0-000000?style=for-the-badge&logo=flask&logoColor=white)
![NetworkX](https://img.shields.io/badge/NetworkX-3.2-orange?style=for-the-badge)
![NumPy](https://img.shields.io/badge/NumPy-1.26-013243?style=for-the-badge&logo=numpy&logoColor=white)
![SciPy](https://img.shields.io/badge/SciPy-1.12-8CAAE6?style=for-the-badge&logo=scipy&logoColor=white)
<br/>
> **An interactive web application that simulates epidemic spread across social networks**  
> using Markov chain-based SIR modeling, and recommends optimal vaccination strategies  
> through Monte Carlo AI analysis.
<br/>
</div>
---
Overview
Patient Zero models how a disease (or information) propagates through a social network. Each node in the network represents a person, and each step of the simulation applies a Markov transition matrix to determine state changes. The built-in AI Advisor runs 300 Monte Carlo scenarios in the background to identify which nodes, if vaccinated, would most effectively stop the outbreak.
This project was built as an Applied Programming Project for an Artificial Intelligence course, implementing Topic 4: Probabilistic Modeling & Simulation.
---
Features
Feature	Description
Live Network Simulation	Watch the epidemic spread node by node in real time
Markov Transition Matrix	Every state change (S→I, I→R) is governed by a live-updating probability matrix
Steady-State Calculation	Solves π = πP via eigenvalue decomposition to predict long-term equilibrium
R₀ Calculator	Basic reproduction number updates instantly as you adjust parameters
Herd Immunity Tracker	Visual progress bar shows how close you are to stopping the epidemic
Monte Carlo AI Advisor	Runs 300 simulations to identify the most critical nodes to vaccinate
Interactive Intervention	Click any node to vaccinate, isolate, or infect it
Network Types	Random (Erdős–Rényi), Cluster (Power-law), Ring (Watts–Strogatz)
SIR Chart	Real-time line graph tracking S, I, and R populations
---
Algorithms
SIR Markov Model
Every node exists in one of four states at any given step:
```
S (Susceptible) ──► I (Infected) ──► R (Recovered)
                                         ▲
V (Vaccinated) ──────────────────────────┘  (absorbing)
```
State transitions are governed by the 3×3 Markov transition matrix:
```
         →S              →I              →R
S  [ 1 - P(S→I)      P(S→I)           0    ]
I  [     0          1 - γ             γ    ]
R  [     0            0              1.0   ]
```
Where:
```
P(S→I) = 1 − (1 − β)^k       # k = number of infected neighbours
P(I→R) = γ                   # recovery probability per step
```
Steady-State Calculation
The long-term equilibrium distribution is found by solving:
```
π · P = π      →      (Pᵀ − I)π = 0
```
Implemented via SciPy eigenvalue decomposition on the transposed matrix.
Basic Reproduction Number
```
R₀ = β / γ
```
R₀ > 1 → epidemic spreads
R₀ < 1 → epidemic fades
Herd immunity threshold = `1 − 1/R₀`
Monte Carlo AI Vaccination Advisor
```python
for each susceptible node i:
    scores[i] = 0
    for trial in range(300):
        vaccinate node i
        run full simulation (max 100 steps)
        scores[i] += baseline_recovered − cases_recovered
    
top_k = sort(scores, descending)[:6]
```
The AI compares 300 randomized outbreak scenarios per candidate node against a baseline (no vaccination), and ranks nodes by how many cases their vaccination prevents on average.
---
Tech Stack
```
Backend                     Frontend
───────────────────────     ────────────────────────
Python 3.10+                HTML5 + CSS3
Flask 3.x                   Vanilla JavaScript (ES6+)
NetworkX 3.x                Chart.js 4.x  (SIR graph)
NumPy 1.26+                 Canvas API    (network viz)
SciPy 1.12+
Flask-CORS
```
---
Installation
Prerequisites
Python 3.10 or higher
pip
Steps
```bash
# 1. Clone the repository
git clone https://github.com/tia88na/Patient-Zero.git
cd Patient-Zero

# 2. Create a virtual environment
python -m venv venv

# Activate — Windows:
venv\Scripts\activate

# Activate — macOS / Linux:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the app
python app.py
```
Open your browser at http://localhost:5000
---
Usage
Basic Simulation
Choose a network type (Random / Cluster / Ring)
Adjust β (transmission rate) and γ (recovery rate)
Hit ▶ Start and watch the epidemic unfold
The Markov matrix and SIR chart update in real time
Manual Intervention
Select a mode from the toolbar, then click any node:
Mode	Effect
Vaccinate	Moves node to V state (immune, cannot spread)
Isolate	Cuts all connections — node can't infect or be infected
Infect	Forces node into I state — seeds a new outbreak
AI Vaccination Advisor
Click ⚙ Run Monte Carlo Analysis
Wait ~2 seconds while the backend runs 300 scenarios
Nodes highlighted with a yellow ring are the AI's top recommendations
Click ✓ Apply AI Suggestions to vaccinate them all at once
Start the simulation and compare the outcome
---
Project Structure
```
Patient-Zero/
│
├── app.py                   # Flask server · Markov matrix · Monte Carlo AI
├── requirements.txt         # Python dependencies
│
├── templates/
│   └── index.html           # Main UI template
│
└── static/
    ├── css/
    │   └── style.css        # Dark theme styling
    └── js/
        └── main.js          # Canvas rendering · simulation loop · API calls
```
---
Course Alignment
Assignment Requirement	Implementation
Working application	✅ Flask web app, runs locally
Core AI algorithm (Topic 4)	✅ Markov chain SIR model
Steady-state probabilities	✅ π = πP via eigenvalue decomposition
Monte Carlo simulation	✅ 300-scenario AI vaccination advisor
Law of Large Numbers demo	✅ More trials → more stable AI recommendations
PDF Report	📄 Submitted separately
Demo Video (max 2 min)	🎥 Submitted separately
---
API Reference
Endpoint	Method	Description
`/`	GET	Serve the main application
`/api/graph`	POST	Generate a new network with node positions
`/api/markov`	POST	Compute transition matrix and steady-state
`/api/ai_suggest`	POST	Run Monte Carlo analysis and return top-k nodes
---
<div align="center">
<br/>
Built for the Artificial Intelligence — Applied Programming Project
</div>
