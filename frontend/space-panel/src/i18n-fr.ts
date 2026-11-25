/* French text of the Share Space panel, keyed by the English source text. */
import { registerTranslations } from "ha-share-space-ui";

registerTranslations("fr", {
  "Could not render dashboard":
    "Impossible d'afficher le tableau de bord",
  "Loading…":
    "Chargement…",
  "No view of this dashboard is visible to you.":
    "Aucune vue de ce tableau de bord ne vous est visible.",
  "This dashboard has no views.":
    "Ce tableau de bord n'a aucune vue.",
  "View {n}":
    "Vue {n}",
  "Overview (default)":
    "Vue d'ensemble (par défaut)",
  "YAML dashboard: set who sees each view in its YAML file.":
    "Tableau de bord YAML : définissez qui voit chaque vue dans son fichier YAML.",
  "Auto-generated dashboard: take control of it in Home Assistant to choose who sees it.":
    "Tableau de bord généré automatiquement : prenez-en le contrôle dans Home Assistant pour choisir qui le voit.",
  "Who sees {name}":
    "Qui voit {name}",
  "view {n}":
    "vue {n}",
  "Everyone":
    "Tout le monde",
  "Dashboards":
    "Tableaux de bord",
  "Build a dashboard in Home Assistant, then pick it to show it as a tab here. Choose who sees each of its views.":
    "Créez un tableau de bord dans Home Assistant, puis choisissez-le pour l'afficher ici comme onglet. Choisissez qui voit chacune de ses vues.",
  "Show as tabs":
    "Afficher en onglets",
  "Dashboards shown as tabs":
    "Tableaux de bord affichés en onglets",
  "No dashboard":
    "Aucun tableau de bord",
  "Scheduler":
    "Scheduler",
  "Automation":
    "Automatisation",
  "On":
    "Activé",
  "Off":
    "Désactivé",
  "Open in Home Assistant":
    "Ouvrir dans Home Assistant",
  "In Home Assistant":
    "Dans Home Assistant",
  "In Share Space rules":
    "Dans les règles Share Space",
  "Not copied":
    "Non copié",
  "As Share Space rules":
    "En règles Share Space",
  "Already in Home Assistant":
    "Déjà dans Home Assistant",
  "Looking for schedules and automations…":
    "Recherche des planifications et automatisations…",
  "Schedules and automations that heat this area today, read only here. Saving Share Space rules for this area turns the ones that are on off, so the rules are its only heating.":
    "Planifications et automatisations qui chauffent cette zone aujourd'hui, en lecture seule ici. Enregistrer des règles Share Space pour cette zone désactive celles qui sont actives : les règles deviennent son seul chauffage.",
  "Share Space rules are on too: both act on the radiators. Save the rules again to turn these off, or turn the rules off.":
    "Les règles Share Space sont aussi actives : les deux agissent sur les radiateurs. Enregistrez à nouveau les règles pour désactiver ces éléments, ou désactivez les règles.",
  "Current state":
    "État actuel",
  "Saved template":
    "Modèle enregistré",
  "none":
    "aucun",
  "Driving the target":
    "Pilote la consigne",
  "Yes (mode: template)":
    "Oui (mode : template)",
  "No":
    "Non",
  "Last result":
    "Dernier résultat",
  "Last error":
    "Dernière erreur",
  "Loading...":
    "Chargement...",
  "Extension points":
    "Points d'extension",
  "Hooks where a Jinja template replaces a default behaviour.":
    "Points d'accroche où un modèle Jinja remplace un comportement par défaut.",
  "No heated areas.":
    "Aucune zone chauffée.",
  "Heated areas":
    "Zones chauffées",
  "Heating target: {name}":
    "Consigne de chauffage : {name}",
  "None":
    "Aucun",
  "Temperature":
    "Température",
  "My area":
    "Ma zone",
  "My planning":
    "Mon planning",
  "Other areas":
    "Autres zones",
  "Heating":
    "Chauffage",
  "No heated area yet.":
    "Aucune zone chauffée pour l'instant.",
  "Planned":
    "Prévu",
  "Nobody planned":
    "Personne de prévu",
  "Planning":
    "Planning",
  "No heated area and nobody planned yet.":
    "Aucune zone chauffée et personne de prévu pour l'instant.",
  "Area":
    "Zone",
  "No Share Space rules for this area yet: the week shows who is planned.":
    "Pas encore de règles Share Space pour cette zone : la semaine montre qui est prévu.",
  "Pages":
    "Pages",
  "Could not load the plannings.":
    "Impossible de charger les plannings.",
  "Could not save the planning.":
    "Impossible d'enregistrer le planning.",
  "Edit someone's work area and planning":
    "Modifier la zone de travail et le planning de quelqu'un",
  "Work area":
    "Zone de travail",
  "Could not save the work area.":
    "Impossible d'enregistrer la zone de travail.",
  "Person":
    "Personne",
  "Choose a person":
    "Choisir une personne",
  "Saved as soon as you change it: the work area in Share Space, the planning in that person's own Schedule helper.":
    "Enregistré dès que vous le modifiez : la zone de travail dans Share Space, le planning dans l'assistant Schedule de cette personne.",
  "Everyone's planning":
    "Planning de tout le monde",
  "The whole week, then each person's own planning, which the area plannings merge.":
    "Toute la semaine, puis le planning de chaque personne, que les plannings de zone fusionnent.",
  "No person in Home Assistant yet.":
    "Aucune personne dans Home Assistant pour l'instant.",
  "No area":
    "Aucune zone",
  "{hours} h a week":
    "{hours} h par semaine",
  "Another shared strategy already has this name.":
    "Une autre stratégie partagée porte déjà ce nom.",
  "Otherwise":
    "Sinon",
  "The heating zone was created but is not listed yet; try again.":
    "La zone de chauffage a été créée mais n'apparaît pas encore ; réessayez.",
  "Copied from Home Assistant below. Check the rules, then save.":
    "Copié depuis Home Assistant ci-dessous. Vérifiez les règles, puis enregistrez.",
  "Start this area's rules":
    "Démarrer les règles de cette zone",
  "This area has no Share Space rules yet. Home Assistant heats it with {names}.":
    "Cette zone n'a pas encore de règles Share Space. Home Assistant la chauffe avec {names}.",
  "Migrate what is on":
    "Migrer ce qui est actif",
  "Start from scratch":
    "Partir de zéro",
  "Migrate copies them into the rules, except the lines marked \"Not copied\" below. Nothing changes in Home Assistant until you save.":
    "La migration les copie dans les règles, sauf les lignes marquées « Non copié » ci-dessous. Rien ne change dans Home Assistant avant l'enregistrement.",
  "Migrate copies them into the rules. Nothing changes in Home Assistant until you save.":
    "La migration les copie dans les règles. Rien ne change dans Home Assistant avant l'enregistrement.",
  "This automation was changed outside Share Space; reloaded.":
    "Cette automatisation a été modifiée en dehors de Share Space ; rechargée.",
  "← All areas":
    "← Toutes les zones",
  "Shared strategy: {name}":
    "Stratégie partagée : {name}",
  "missing":
    "introuvable",
  "Custom, 1 rule":
    "Personnalisé, 1 règle",
  "Custom, {n} rules":
    "Personnalisé, {n} règles",
  "Share Space":
    "Share Space",
  "Share Space, off":
    "Share Space, désactivé",
  "Home Assistant":
    "Home Assistant",
  "No heating rules":
    "Aucune règle de chauffage",
  "No heated area found in Home Assistant yet.":
    "Aucune zone chauffée trouvée dans Home Assistant pour l'instant.",
  "Loading areas…":
    "Chargement des zones…",
  "Heating rules by area":
    "Règles de chauffage par zone",
  "What heats each area today. Open one to see or edit its rules.":
    "Ce qui chauffe chaque zone aujourd'hui. Ouvrez-en une pour voir ou modifier ses règles.",
  "Choose an area":
    "Choisir une zone",
  "No heating yet: set it up in Settings → Heating.":
    "Pas encore de chauffage : configurez-le dans Paramètres → Chauffage.",
  "Several heating zones are in {area}. Keep one thermostat per area in Home Assistant (Settings → Entities).":
    "Plusieurs zones de chauffage sont dans {area}. Gardez un seul thermostat par zone dans Home Assistant (Paramètres → Entités).",
  "{entity} has no area. Assign it to an area in Home Assistant (Settings → Entities).":
    "{entity} n'a pas de zone. Affectez-le à une zone dans Home Assistant (Paramètres → Entités).",
  "New name":
    "Nouveau nom",
  "Shared strategy name":
    "Nom de la stratégie partagée",
  "e.g. Old building":
    "ex. Bâtiment ancien",
  "Rename":
    "Renommer",
  "Share":
    "Partager",
  "Cancel":
    "Annuler",
  "Name already used.":
    "Nom déjà utilisé.",
  "uses":
    "utilise",
  "Strategy":
    "Stratégie",
  "Custom for this area":
    "Personnalisé pour cette zone",
  "+ New shared strategy…":
    "+ Nouvelle stratégie partagée…",
  "Used by {names}":
    "Utilisée par {names}",
  "Not used by any area yet":
    "Pas encore utilisée par une zone",
  "Shared":
    "Partagée",
  "{n} areas":
    "{n} zones",
  "1 area":
    "1 zone",
  "unused":
    "inutilisée",
  "These rules are not the ones running for this area":
    "Ces règles ne sont pas celles qui s'exécutent pour cette zone",
  "No strategy automation is running for this zone":
    "Aucune automatisation de stratégie ne s'exécute pour cette zone",
  "Not active":
    "Inactif",
  "Make a copy for this area":
    "Faire une copie pour cette zone",
  "Delete":
    "Supprimer",
  "Used by {names}: delete is disabled while an area uses it.":
    "Utilisée par {names} : la suppression est désactivée tant qu'une zone l'utilise.",
  "Share these rules…":
    "Partager ces règles…",
  "More actions":
    "Plus d'actions",
  "Saving switches this area to {name}.":
    "L'enregistrement fait passer cette zone à {name}.",
  "Saving gives this area its own copy; other areas keep {name}.":
    "L'enregistrement donne à cette zone sa propre copie ; les autres zones gardent {name}.",
  "These rules are saved but not running. Save to use them.":
    "Ces règles sont enregistrées mais ne s'exécutent pas. Enregistrez pour les utiliser.",
  "Changes apply to {n} areas.":
    "Les modifications s'appliquent à {n} zones.",
  "Delete the shared strategy {name}?":
    "Supprimer la stratégie partagée {name} ?",
  "New rules automation. Saving it disables the detached one.":
    "Nouvelle automatisation de règles. L'enregistrer désactive l'automatisation détachée.",
  "This area uses a shared strategy that no longer exists. Pick one, or edit custom rules.":
    "Cette zone utilise une stratégie partagée qui n'existe plus. Choisissez-en une, ou modifiez des règles personnalisées.",
  "Preview":
    "Aperçu",
  "Choose an area to see the preview.":
    "Choisissez une zone pour voir l'aperçu.",
  "Saving…":
    "Enregistrement…",
  "Save":
    "Enregistrer",
  "Undo last change":
    "Annuler la dernière modification",
  "Discard":
    "Abandonner",
  "Unsaved changes":
    "Modifications non enregistrées",
  "Saving turns off in Home Assistant: {names}. These rules become the only heating for this area.":
    "L'enregistrement désactive dans Home Assistant : {names}. Ces règles deviennent le seul chauffage de cette zone.",
  "Edited outside Share Space":
    "Modifiée en dehors de Share Space",
  "Not managed by Share Space":
    "Non gérée par Share Space",
  "Take back overwrites it with the last rules Share Space can read. Detach leaves it as a normal Home Assistant automation.":
    "Reprendre l'écrase avec les dernières règles que Share Space peut lire. Détacher la laisse comme une automatisation Home Assistant normale.",
  "Take back":
    "Reprendre",
  "Detach":
    "Détacher",
  "This automation is detached; edit it in Home Assistant.":
    "Cette automatisation est détachée ; modifiez-la dans Home Assistant.",
  "Open automation":
    "Ouvrir l'automatisation",
  "Create a new rules automation for this area? The detached one will be disabled.":
    "Créer une nouvelle automatisation de règles pour cette zone ? L'automatisation détachée sera désactivée.",
  "Confirm":
    "Confirmer",
  "Start new rules":
    "Démarrer de nouvelles règles",
  "Rules":
    "Règles",
  "No heated area yet. Set up heating in Settings.":
    "Aucune zone chauffée pour l'instant. Configurez le chauffage dans Paramètres.",
  "User":
    "Utilisateur",
  "Space admin":
    "Administrateur de l'espace",
  "Technical admin":
    "Administrateur technique",
  "Outdoor temperature":
    "Température extérieure",
  "Sensor":
    "Capteur",
  "Outdoor temperature sensor":
    "Capteur de température extérieure",
  "{name} (unavailable)":
    "{name} (indisponible)",
  "Rules that follow the outdoor temperature read this sensor (e.g. Old building's preheat). None: they use their default.":
    "Les règles qui suivent la température extérieure lisent ce capteur (ex. préchauffage du bâtiment ancien). Aucun : elles utilisent leur valeur par défaut.",
  "Settings":
    "Paramètres",
  "Your role:":
    "Votre rôle :",
  "Technical tools":
    "Outils techniques",
  "Full Home Assistant interface":
    "Interface complète de Home Assistant",
  "Only for your account, and it wins over the page set for everyone. Off: Home Assistant opens on Share Space after login. On: its usual interface, with a Back button here.":
    "Uniquement pour votre compte, et prioritaire sur la page définie pour tout le monde. Désactivé : Home Assistant s'ouvre sur Share Space après la connexion. Activé : son interface habituelle, avec un bouton Retour ici.",
  "Open Share Space after login for everyone":
    "Ouvrir Share Space après la connexion pour tout le monde",
  "Home Assistant's own default page for all users. Someone who picked another page in their Home Assistant profile keeps it.":
    "Page par défaut de Home Assistant pour tous les utilisateurs. Une personne qui a choisi une autre page dans son profil Home Assistant la conserve.",
  "Entity":
    "Entité",
  "Card":
    "Carte",
  "Overview":
    "Vue d'ensemble",
  "Dashboard":
    "Tableau de bord",
  "Space":
    "Espace",
  "Plannings":
    "Plannings",
  "Areas":
    "Zones",
  "Could not render card":
    "Impossible d'afficher la carte",
  "Back":
    "Retour",
  "Log out":
    "Se déconnecter",
  "No floor plan yet":
    "Pas encore de plan",
  "Create plan":
    "Créer le plan",
  "Ask an administrator to create one.":
    "Demandez à un administrateur d'en créer un.",
  "Edit":
    "Modifier",
  "Close":
    "Fermer",
  "Entity not found: {id}":
    "Entité introuvable : {id}",
  "Occupied":
    "Occupée",
  "Empty":
    "Vide",
  "Unknown":
    "Inconnu",
  "Nobody assigned":
    "Personne d'affecté",
  "Toggle":
    "Basculer",
  "Plan name":
    "Nom du plan",
  "Image URL":
    "URL de l'image",
  "Leave empty for the placeholder. Drag on the image to draw a hotspot.":
    "Laissez vide pour l'image par défaut. Faites glisser sur l'image pour dessiner une zone cliquable.",
  "Draw a rectangle, or tap a hotspot to edit it.":
    "Dessinez un rectangle, ou touchez une zone cliquable pour la modifier.",
  "Label":
    "Libellé",
  "Type":
    "Type",
  "Delete hotspot":
    "Supprimer la zone cliquable",
  "Area id":
    "Identifiant de zone",
  "Entity id":
    "Identifiant d'entité",
  "Card config (JSON)":
    "Configuration de la carte (JSON)",
  "Auto":
    "Auto",
  "Light":
    "Clair",
  "Dark":
    "Sombre",
  "Theme: {current}, next: {next}":
    "Thème : {current}, suivant : {next}",
  "Theme: {current}":
    "Thème : {current}",
  "Mode: {current}, next: {next}":
    "Mode : {current}, suivant : {next}",
  "Mode: {current}":
    "Mode : {current}",
  "Theme":
    "Thème",
  "Mode":
    "Mode",
  "People":
    "Personnes",
  "Space Admins manage areas, heating, rules and people. They can't remove their own role or the owner's.":
    "Les administrateurs de l'espace gèrent les zones, le chauffage, les règles et les personnes. Ils ne peuvent pas retirer leur propre rôle ni celui du propriétaire.",
  "owner":
    "propriétaire",
  "you":
    "vous",
  "Space Admin":
    "Administrateur de l'espace",
  "Choose…":
    "Choisir…",
  "Heaters (smart plugs or switches)":
    "Radiateurs (prises connectées ou interrupteurs)",
  "Existing thermostat":
    "Thermostat existant",
  "Remove {name}":
    "Retirer {name}",
  "Add another heater":
    "Ajouter un autre radiateur",
  "Heater":
    "Radiateur",
  "Temperature sensor":
    "Capteur de température",
  "Share Space creates the thermostat: heaters turn on below the target, off above it.":
    "Share Space crée le thermostat : les radiateurs s'allument sous la consigne et s'éteignent au-dessus.",
  "Thermostat":
    "Thermostat",
  "Create zone":
    "Créer la zone",
  "Heaters: {names}":
    "Radiateurs : {names}",
  "Sensor: {name}":
    "Capteur : {name}",
  "Thermostat: {name}":
    "Thermostat : {name}",
  "{temp} °C now":
    "{temp} °C actuellement",
  "Keep":
    "Conserver",
  "Stop managing":
    "Arrêter la gestion",
  "Share Space finds each area's thermostat, or heater switches and temperature sensor, in Home Assistant. Nothing is created or changed until you save the area's first rule. Stop managing removes only what Share Space created, never your devices.":
    "Share Space trouve dans Home Assistant le thermostat de chaque zone, ou ses interrupteurs de radiateurs et son capteur de température. Rien n'est créé ni modifié avant l'enregistrement de la première règle de la zone. Arrêter la gestion ne supprime que ce que Share Space a créé, jamais vos appareils.",
  "Found in Home Assistant: thermostat {name}. Used once the area has a rule.":
    "Trouvé dans Home Assistant : thermostat {name}. Utilisé dès que la zone a une règle.",
  "Found in Home Assistant: heaters {heaters}, sensor {sensor}. Used once the area has a rule.":
    "Trouvé dans Home Assistant : radiateurs {heaters}, capteur {sensor}. Utilisés dès que la zone a une règle.",
  "No thermostat, or heaters and temperature sensor, in this area in Home Assistant":
    "Ni thermostat, ni radiateurs et capteur de température, dans cette zone dans Home Assistant",
  "Add heating":
    "Ajouter le chauffage",
  "Several thermostats in this area: {names}. Move all but one to another area in Home Assistant (Settings → Entities).":
    "Plusieurs thermostats dans cette zone : {names}. Déplacez-les tous sauf un vers une autre zone dans Home Assistant (Paramètres → Entités).",
  "No area: assign {name} to an area in Home Assistant (Settings → Entities) so rules can run.":
    "Aucune zone : affectez {name} à une zone dans Home Assistant (Paramètres → Entités) pour que les règles puissent s'exécuter.",
  "No areas yet: the Technical Admin creates them in Home Assistant.":
    "Aucune zone pour l'instant : l'administrateur technique les crée dans Home Assistant.",
  "This dashboard is auto-generated. In Home Assistant, open it, then ⋮ > Edit dashboard > Take control, to show it here.":
    "Ce tableau de bord est généré automatiquement. Dans Home Assistant, ouvrez-le, puis ⋮ > Modifier le tableau de bord > Prendre le contrôle, pour l'afficher ici.",
});
