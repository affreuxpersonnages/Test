# Atelier Mèche — prise de rendez-vous en ligne pour coiffeurs

Application de réservation pour salon de coiffure, avec deux interfaces :

| Interface | URL | Pour qui |
|---|---|---|
| **Réserver** (invité) | `/#reserver` | Le client choisit sa prestation, ses options, son coiffeur et un créneau libre |
| **Mes rendez-vous** (invité) | `/#mes-rdv` | Retrouver / annuler un RDV avec son n° (`AM-XXXXX`) + téléphone |
| **Espace pro · dev** | `/#pro` | Planning, réservations, catalogue, équipe, horaires, outils développeur |

## Lancer

```bash
node server.js          # Node 18+, aucune dépendance
# → http://localhost:3000
```

Variable `PORT` pour changer le port. Les données sont enregistrées dans `data/db.json`.

### Code d'accès pro : `1234`

L'espace pro demande un code (par défaut **1234**, modifiable dans l'onglet Développeur,
ou imposé avec la variable `ADMIN_PIN`). Avec le serveur Node, l'API exige ce code
(en-tête `x-admin-pin`) pour toute modification ; il n'est jamais renvoyé aux visiteurs.
Un client peut seulement annuler son propre RDV (vérification par téléphone).

Le fichier `public/index.html` fonctionne aussi **seul** (ouvert sans serveur) : il bascule alors
sur le stockage du navigateur (`localStorage`), pratique pour tester.

## Options coiffeur incluses

- **Prestations** par catégorie : Femme, Homme, Enfant, Couleur (racines, balayage, mèches, ombré…),
  Techniques (lissage brésilien, permanente), Barbe, Mariage & événement — durée et prix éditables.
- **Supplément selon la longueur** des cheveux (courts / mi-longs / longs : + prix et + durée).
- **Options & soins** ajoutables : soin kératine, masque, massage crânien, patine/gloss, Plex…
  (nombre max configurable).
- **Choix du coiffeur** ou « Sans préférence » (attribution au moins chargé).
  Chaque coiffeur a ses jours de travail et ses catégories de prestations.
- **Horaires** par jour avec pause déjeuner, **fermetures exceptionnelles** (congés, fériés).
- **Règles** : pas des créneaux, temps de battement entre clients, délai minimum, horizon de réservation,
  délai d'annulation en ligne, confirmation automatique ou validation manuelle, acompte affiché, e-mail obligatoire.
- **Statuts** : confirmé, en attente, annulé, honoré, absent (no-show).

## Interface développeur (onglet « Développeur »)

- Mode de stockage actif (API Node / navigateur / base partagée claude.ai)
- Générer / supprimer 20 RDV de démo, réinitialiser la config, tout effacer
- Export / import JSON complet, journal des événements

## API REST

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/state` | `{ config, bookings }` |
| PUT | `/api/config` | `{ config }` |
| GET | `/api/bookings?date=AAAA-MM-JJ` | Liste (filtre optionnel) |
| POST | `/api/bookings` | Crée un RDV — `409 slot_taken` si le créneau chevauche |
| PATCH | `/api/bookings/:id` | `{ status }` |
| POST | `/api/bookings/delete` | `{ ids: [] }` |
| PUT | `/api/state` | Import complet |
| POST | `/api/login` | `{ pin }` → 200 ou 401 |

Routes de modification (config, import, suppression, PATCH) : en-tête `x-admin-pin` requis.

## À prévoir avant une mise en production

Version de test : l'accès pro est un simple code partagé et aucun SMS / e-mail de rappel n'est envoyé.
À ajouter : vrais comptes pro, envoi de confirmations, paiement d'acompte, base de données (SQLite/Postgres).
