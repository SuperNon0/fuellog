# FuelLog

Application web (PWA) de **suivi de carburant et d'entretien** pour un ou plusieurs
véhicules. Installable sur l'écran d'accueil (iPhone, iPad, ordinateur), pensée
pour un usage **personnel**, derrière **Cloudflare Access** avec un **mot de passe
local de secours**.

> Version **autonome** (branche `socle-lite`) : Flask, sans dépendance à un
> « site-base » externe. Sécurité reprise du socle-lite (vérif Cloudflare testée),
> le reste est embarqué dans le dépôt.

---

## Fonctionnalités

- **Pleins en deux phases** : saisie rapide (phase 1), puis complément au plein
  suivant (km réels + estimation ODB) → calculs précis.
- **Plein complet vs ajout partiel** : un ajout est enregistré comme un plein
  mais exclu des moyennes par plein (conso, coût, fréquence).
- **Précision ODB** : compare l'autonomie annoncée par la voiture au réel, plus
  l'« autonomie réelle » (km parcourus + restant ODB au moment du plein).
- **Statistiques & graphiques** : dépense, litres, conso, prix/L, km, projection
  annuelle, filtrables par année.
- **Stations** (API prix carburants gouv.) : proches, favoris, prix, itinéraire.
- **Entretien** : date, km, catégorie, coût, commentaire, **photos/PDF de factures**
  et export d'un **carnet PDF** (récap + factures assemblées).
- **Multi-véhicules** : chaque plein / entretien rattaché à un véhicule.
- **Sauvegarde / restauration complète** en un fichier `.json` (véhicules, pleins,
  entretiens, favoris, **factures incluses**) — sert aussi à **migrer** d'une
  installation à une autre.
- **Export CSV** (pleins, entretiens).
- **Accès & sécurité intégré** : configuration Cloudflare (équipe / AUD / vérif
  JWT) avec bouton **Tester**, mot de passe local, et interrupteur **accès local**.
- **PWA** : icône d'accueil, plein écran, anti-zoom sur iPhone.

---

## Installation (en une commande)

### Sur un hôte **Proxmox** (recommandé)
Colle ceci **dans le shell de l'hôte Proxmox** : ça crée un conteneur LXC Debian 12,
l'installe et le démarre.

```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/SuperNon0/fuellog/socle-lite/proxmox/fuellog-lxc.sh)"
```

Options possibles (facultatives) :

```bash
CTID=211 HOSTNAME=FuelLog PANEL_PORT=8000 ADMIN_PASSWORD='monMotDePasse' \
  bash -c "$(wget -qLO - https://raw.githubusercontent.com/SuperNon0/fuellog/socle-lite/proxmox/fuellog-lxc.sh)"
```

À la fin, le script affiche l'**adresse** (`http://<ip>:<port>`) et le **mot de
passe admin** (généré si tu n'en as pas fourni).

### Sur une VM / un conteneur **Debian ou Ubuntu** déjà en place (en root)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/SuperNon0/fuellog/socle-lite/install.sh)
```

L'installeur crée un utilisateur `fuellog`, un venv Python, le fichier `.env`, un
**service systemd** (redémarrage automatique au boot et après un crash) puis démarre
tout. Résumé (IP + mot de passe) affiché à la fin.

---

## Après l'installation

1. **Connexion** : ouvre `http://<ip>:<port>`, entre le **mot de passe admin** du résumé.
2. **Cloudflare (prod)** : expose l'appli derrière **Cloudflare Access** (tunnel
   `cloudflared` ou pare-feu IP Cloudflare), puis dans **Gestion → Accès & sécurité** :
   renseigne **Équipe** (nom seul, ex. `super-nono`) + **AUD**, coche *Vérifier le
   JWT*, clique **Tester** (doit afficher *JWT OK*), puis **Enregistrer**.
3. **Accès local** : la case *Autoriser l'accès local* garde le mot de passe LAN de
   secours. **Décochée = entrée uniquement par Cloudflare** (accès direct → 403).
   Ne la décoche **qu'après** avoir testé Cloudflare, sinon risque de verrouillage
   (récupération : `sudo bash deploy/reset-password.sh` puis
   `python manage.py local_login on`).
4. **Migrer tes données** depuis l'ancienne version : sur l'ancien FuelLog,
   **Gestion → Sauvegarde → Télécharger** ; sur le nouveau, **Restaurer une
   sauvegarde** (le `.json`). Les factures et le carnet sont inclus.

---

## Architecture

Deux couches, **toutes deux dans le dépôt** (aucune dépendance externe) :

```
fuellog/
├── panel/            ← fondation (reprise/adaptée de socle-lite)
│   ├── __init__.py   fabrique Flask (DB + auth + thème + surcouche)
│   ├── auth.py       Cloudflare Access (JWT RS256+aud+iss) + secours local
│   ├── config.py     config .env
│   ├── db.py         SQLite : app_settings (réglages) + amorce mot de passe
│   ├── settings.py   get/set réglages (Cloudflare, hash mdp, accès local)
│   ├── templates/    thème : base.html, login.html, oubli.html, bloque.html
│   └── static/       style du shell + fonts + logo
├── app/              ← métier FuelLog (les écrans)
│   ├── __init__.py   register() branche le blueprint
│   ├── routes.py     API + écrans (pleins, véhicules, entretien, stations, données)
│   ├── schema.sql    tables métier
│   ├── templates/    dashboard.html
│   └── static/       css / js / icônes / vendor / manifest
├── deploy/           fuellog.service, reset-password.sh
├── install.sh · proxmox/fuellog-lxc.sh · run.py · wsgi.py · manage.py
```

- **Sécurité** : le jeton Cloudflare est **vérifié** (signature RS256, `aud`, `iss`) ;
  on ne fait **jamais** confiance à l'en-tête `Cf-Access-Authenticated-User-Email`
  seul. La config (équipe/AUD/vérif, mot de passe **hashé**, accès local) est
  stockée en base (`app_settings`) et éditable depuis l'UI.
- **Mono-utilisateur** : un seul statut (authentifié ou refusé), pas de comptes/rôles.

---

## Configuration (`.env`)

Voir `.env.example`. Ces variables **amorcent** le 1er lancement ; ensuite la config
Cloudflare et le mot de passe se règlent **dans l'UI** (Gestion → Accès & sécurité).

| Variable | Effet |
|---|---|
| `SECRET_KEY` | clé de session (obligatoire, aléatoire) |
| `DATABASE_PATH` | chemin de la base SQLite |
| `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` / `CF_VERIFY_JWT` | Cloudflare Access |
| `ALLOW_LOCAL_LOGIN` | autoriser le mot de passe local (secours LAN) |
| `ADMIN_PASSWORD` | mot de passe admin d'amorce (hashé en base au 1er démarrage) |
| `ALLOWED_EMAILS` | (option) restreindre aussi côté appli |

---

## Opérations

- **Réinitialiser le mot de passe** (serveur, jamais depuis le web) :
  ```bash
  sudo bash deploy/reset-password.sh                 # génère et affiche un mot de passe
  sudo bash deploy/reset-password.sh 'MonNouveauMdp' # fixe un mot de passe précis
  ```
- **Se débloquer si l'accès local a été coupé** :
  ```bash
  cd /opt/fuellog && python manage.py local_login on
  ```
- **Mise à jour** :
  ```bash
  cd /opt/fuellog && sudo -u fuellog git pull && \
    sudo -u fuellog .venv/bin/pip install -q -r requirements.txt && \
    sudo systemctl restart fuellog
  ```
- **Logs** : `journalctl -u fuellog -f`

---

## Développement local

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # règle SECRET_KEY + ADMIN_PASSWORD ; CF_VERIFY_JWT=false en dev
python run.py           # http://127.0.0.1:8000
```
