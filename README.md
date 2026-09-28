# 🛡️ Safety Hub 2035 — Plateforme Collaborative de Sécurité & Cartographie Temps Réel

Application web progressive (PWA) et mobile-first de cartographie temps réel, signalement citoyen sécurisé, modération automatique et alertes géospatiales de proximité.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)
![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?logo=fastapi)
![Mapbox GL](https://img.shields.io/badge/Mapbox-GL%20JS-000000?logo=mapbox)
![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite)

---

## ✨ Fonctionnalités Principales

- 🗺️ **Moteur Cartographique Hybride** : Rendu vectoriel Mapbox GL avec vue urbaine 3D inclinée (35°/45°), mode globe planétaire immersif (atmosphère & étoiles) et bascule jour/nuit automatique.
- 📍 **Géolocalisation Résiliente & Sans Lag** : 
  - Acquisition multi-paliers (GPS haute précision matériel + fallback réseau cellulaire/Wi-Fi).
  - Transition de caméra ultra-fluide (`easeTo` 750ms sans décrochage de tuiles ni sauts d'altitude).
  - Marqueur utilisateur DOM pulsant flottant au-dessus des couches 3D.
- 🚨 **Signalement & Modération en Direct** :
  - Formulaire de signalement rapide avec géocodage inverse automatique.
  - Modération multicouche (règles sémantiques, détection d'évasion typographique, protection des données personnelles).
  - Outil de traçage vectoriel sur carte pour délimiter les zones à risque.
- 🔔 **Alertes de Proximité & Dynamic Island** :
  - Notification en temps réel des incidents signalés dans un rayon de 500m.
  - Interface dynamique style Dynamic Island iOS avec rétractation tactile.
- 📱 **Expérience PWA & Offline** :
  - Installable sur iOS et Android comme une application native.
  - Détection hors-ligne avec bandeau d'alerte et mise en cache des incidents récents.
- 🔒 **Sécurité Renforcée (Defense-in-Depth)** :
  - Protection anti-IDOR avec tokens cryptographiques HMAC-SHA256 par signalement.
  - Floutage géométrique des coordonnées privées et rate limiting adaptatif.

---

## 🛠️ Stack Technique

### Frontend
- **Framework** : React 19 + TypeScript
- **Bundler** : Vite 8
- **Cartographie** : Mapbox GL JS
- **Design & UI** : Tailwind CSS, Lucide React, Canvas Confetti

### Backend
- **Framework** : FastAPI (Python 3.12 / 3.14)
- **Base de données** : PostgreSQL / Neon via SQLAlchemy (fallback SQLite pour le développement local)
- **Sécurité** : Validation Pydantic, HMAC-SHA256, assainissement HTML

---

## 🚀 Démarrage Rapide

### Prérequis
- [Node.js](https://nodejs.org/) (version 18 ou supérieure)
- [Python](https://www.python.org/) (version 3.11 ou supérieure)
- Un compte [Mapbox](https://www.mapbox.com/) pour obtenir un jeton d'accès public

### 1. Cloner le projet
```bash
git clone https://github.com/<votre-utilisateur>/safety-app.git
cd safety-app
```

### 2. Installer les dépendances Frontend
```bash
npm install
```

### 3. Lancer en local
```bash
npm run dev
```
L'application s'ouvrira sur `http://localhost:5173`.

### 4. Lancer le Backend (Optionnel pour l'API complète)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Sur Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

---

## 📦 Déploiement

Le projet est configuré pour un déploiement continu et automatisé sur [Vercel](https://vercel.com/) (Frontend Vite + Serverless Python API).

```bash
# Build de production
npm run build
```

---

## 📄 Licence

Ce projet est sous licence MIT.
