# Installation rapide de BiblioClasse

## 1 — Créer Firebase

1. Aller sur https://console.firebase.google.com/
2. Créer un projet nommé `biblioclasse`.
3. Dans **Build > Authentication > Sign-in method**, activer **E-mail/Mot de passe**.
4. Dans **Build > Firestore Database**, créer la base en mode Production.
5. Choisir une région européenne si proposée.
6. Dans Firestore > Règles, remplacer les règles par le contenu du fichier `firestore.rules`, puis publier.
7. Dans la page d’accueil du projet Firebase, cliquer sur l’icône Web `</>` pour ajouter une application Web.
8. Donner le nom `BiblioClasse` et enregistrer.
9. Firebase affiche un bloc contenant `const firebaseConfig = { ... }`. Copier uniquement l’objet entre `{` et `}`.

## 2 — Créer GitHub Pages

1. Aller sur https://github.com/ et créer un compte si nécessaire.
2. Créer un nouveau dépôt public nommé `biblioclasse`.
3. Dans le dépôt, choisir **Add file > Upload files**.
4. Envoyer tous les fichiers de ce dossier :
   - index.html
   - app.js
   - styles.css
   - manifest.webmanifest
   - sw.js
   - firestore.rules (peut rester dans le dépôt)
   - README.md
5. Valider avec **Commit changes**.
6. Aller dans **Settings > Pages**.
7. Dans **Build and deployment**, choisir **Deploy from a branch**.
8. Branch : `main` ; dossier : `/ (root)` ; enregistrer.
9. Patienter quelques minutes. L’adresse sera du type `https://VOTRE-COMPTE.github.io/biblioclasse/`.

## 3 — Première ouverture

1. Ouvrir l’adresse BiblioClasse dans le navigateur.
2. Coller l’objet `firebaseConfig` lorsque BiblioClasse le demande.
3. Créer le compte enseignant avec votre e-mail et un mot de passe d’au moins 6 caractères.
4. Le PIN enseignant initial est `1234`. Le changer dans **Réglages**.

## 4 — iPhone / iPad

1. Ouvrir l’adresse HTTPS dans Safari.
2. Autoriser l’accès à la caméra lorsque demandé.
3. Toucher **Partager > Sur l’écran d’accueil > Ajouter**.
4. Sur chaque autre iPad, ouvrir la même adresse et se connecter une seule fois avec le même compte enseignant.
5. Les élèves utiliseront ensuite seulement **Mode élève** ; ils n’auront pas à saisir le mot de passe Firebase.

## 5 — Première utilisation conseillée

1. Ajouter la liste des élèves.
2. Lancer **Enseignant > Ajouter > Inventaire rapide**.
3. Scanner les livres à la chaîne.
4. Corriger les quelques livres marqués à compléter.
5. Aller dans **Cotation** pour vérifier les collections et attribuer les cotes.
6. Exporter une sauvegarde JSON une fois le premier inventaire terminé.
