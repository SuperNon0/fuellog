// Configuration PM2 pour FuelLog.
// Démarrage : pm2 start ecosystem.config.js
module.exports = {
  apps: [{
    name: 'fuellog',
    script: 'server.js',
    cwd: __dirname,
    autorestart: true,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,

      // Emplacements des données (par défaut : dans le dossier du projet).
      // Décommente pour les stocker ailleurs (ex : volume dédié) :
      // DB_PATH: '/opt/fuellog-data/fuellog.db',
      // UPLOAD_DIR: '/opt/fuellog-data/uploads',

      // Bouton "Mettre à jour" depuis l'interface.
      // '1' = activé (recommandé pour un usage privé DERRIÈRE un accès protégé).
      // '0' = désactivé (à utiliser si l'app est exposée publiquement sans authentification,
      //        car la mise à jour exécute des commandes shell sur le serveur).
      ALLOW_SELF_UPDATE: '1',
      PM2_NAME: 'fuellog'
    }
  }]
};
