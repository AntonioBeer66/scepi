# Vague 2 : outil de lisibilité, corpus des cas de la vague 1, ligne de base

Octobre 2026, moteur `src/coinche/engine.js` au commit `b548853` (aucun code de jeu modifié). Outil : `tests/coinche-lisibilite.js`. Tout est mesuré par exécution ; ce qui est de la lecture de code est dit.

## 1. Mode d'emploi de l'outil

```
node tests/coinche-lisibilite.js [engine.js] [parties] [graines] [mondes] [options]
```

| argument | défaut | rôle |
|---|---|---|
| `engine.js` | `src/coinche/engine.js` | moteur à mesurer (une copie instrumentée en mémoire est écrite dans le dossier temporaire puis supprimée ; le fichier n'est jamais modifié) |
| `parties` | 10 | parties de quatre bots jouées pour capturer les positions et compter les conventions |
| `graines` | 5 | rejeux de chaque position (volet 1 et 2) et enchères complètes |
| `mondes` | 96 | `mcSamples`, `bidWorlds`, `bidSamples` |

Options : `--json[=fichier]` (résultats bruts ; sans nom de fichier, JSON seul sur la sortie standard), `--seul=stab,conv,corpus,encheres`, `--lent=k` (horloge ×k, défaut 10), `--graines-corpus=n` (défaut 20), `--donnes=n` (enchères complètes, défaut 24), `--cas=ID,ID` (filtre du corpus).

Pour comparer deux versions : lancer l'outil sur chaque `engine.js` et comparer les deux sorties Markdown (ou les JSON). Les positions viennent des parties de chaque moteur : si le comportement change, les positions changent aussi. Pour un duel apparié strict, le corpus (mêmes situations) et `tests/coinche-ab.js` restent les bons outils.

**Ce que mesure chaque volet**

1. **Instabilité.** N parties, graines `700000+g` (donnes) et `800000+g` (bots), horloge figée. Positions capturées au hasard reproductible (enchères 30 %, entames 35 %, suites 12 %, coinches 60 %, surcoinches 100 %). Chaque position est rejouée K fois depuis le même état (la vue du siège, `seatView`) avec `Math.random = rng(graine)`. Instable : les K réponses ne sont pas toutes égales. On donne aussi la part hors réponse majoritaire et le nombre de réponses distinctes.
2. **Appareil.** Mêmes positions, mêmes graines, `tuning.now()` = k × temps CPU du processus (génération des mondes comprise). On rend : part des réponses qui changent, part des décisions coupées avant la fin de leurs mondes (comptés par deux crochets `__mcN` et `__pm` ajoutés dans la copie), part coupées sous 24 mondes.
3. **Conventions**, sur les décisions réelles des parties. Réflexe = `bots.heuristicCard`, final = carte jouée. Mesurées : défense qui entame atout ; preneur V+9 (3 atouts ou plus, atouts adverses encore dehors) qui n'entame pas atout ; défense qui n'entame pas un As à sa première entame de donne (et au pli 1) ; vrai appel du réflexe (petite carte 7/8/9 sous l'As, au moins 2 cartes de la couleur, aucun signal déjà émis) écrasé par le Monte-Carlo ; appels et refus lus par `readDiscardSignal` (crochet sur la fonction : appel lu faux = le défausseur n'a pas l'As, vérifié dans la vraie main) ; relance dans une couleur déjà annoncée par le partenaire sans J, 9, A ni 10 (et avec au plus 1 atout) ; surenchère sur l'adversaire sans Valet (ni 9).
4. **Corpus** : 43 situations (37 cas de la vague 1 + 6 variantes à sièges humains), reconstruites dans une vraie partie : `createGame` avec donne imposée, enchères et plis joués par `actOn`. Le moteur vérifie la légalité de chaque jeton, donc une séquence incohérente fait échouer le chargement. Mains partielles : le reste est complété au hasard reproductible (graine = hash de l'identifiant).
5. **Enchères complètes** : mêmes donnes, graines de bots différentes, bots seuls ; le contrat final change-t-il ?

**Reproductibilité (vérifiée).** Parties, positions, rejeux à horloge figée et corpus sont déterministes : deux lancements du corpus donnent un texte identique, hors lignes d'horloge lente. L'horloge lente (CPU × k) n'est reproductible qu'à peu près. Les graines du corpus dépendent de l'identifiant du cas, pas de sa place dans la liste (corrigé après un premier essai où l'insertion de cas changeait les tirages).

**Si un motif d'instrumentation manque** (autre version du moteur), l'outil continue et signale « Mesures indisponibles ».

**Temps.** La ligne de base (16 parties, 5 graines, 96 mondes, 20 graines de corpus, 24 donnes) a pris 9 min 53 s de CPU, soit 11 min 29 s d'horloge sur cette machine partagée en `nice -n 10`. Les défauts (10 parties) coûtent environ 60 % de cela : environ 7 minutes dans les mêmes conditions, 2 à 3 minutes sur quatre cœurs libres. Les défauts n'ont pas été chronométrés de bout en bout (seulement la ligne de base à 16 parties).

**Bruit de l'outil lui-même.** Avec 20 graines, l'erreur-type d'une fréquence autour de 50 % est de 11 points. Trois séries de graines différentes ont donné par exemple 0, 0 et 3 coinches sur 20 (COI-6a) ou 2, 4 et 4 passes sur 20 (OUV-1). Un écart de moins de 5 graines sur 20 entre deux versions ne veut rien dire.

## 2. Re-vérification des cas de la vague 1

20 graines, horloge figée, 96 mondes, quatre bots, sauf mention. « Suivi » : le comportement dont parle la vague 1. Les cas marqués *reconstruit* ont une main ou une séquence que le rapport ne donne pas en entier : voir la liste des défauts de description plus bas. Les chiffres « série » entre parenthèses sont ceux d'autres jeux de 20 graines lancés pendant la mise au point.

| cas | situation (reconstruite) | annoncé en vague 1 | mesuré maintenant | verdict |
|---|---|---|---|---|
| OUV-1 | premier à parler, `JH 9H 7H AS 10S KS AD 10D` | passe dans 10 donnes sur 30 (p(80♥) ≈ 1) | 160♥ ×16, 250♥ ×2, passe ×2 (séries : passe 4 et 4) | **nuancé** : le veto sans repli existe, mais passe dans 10 à 20 % des tirages, pas 33 %. 160♥ est annoncé 80 % du temps |
| OUV-2 | premier, `JH 9H 8H 7H QH AS 10S KS` | 500♥ : 3/16 à vitesse réelle, 12/16 à ×20 | figée 500♥ 1/20 ; ×10 : 0 à 1/20 ; ×30 : 3 à 4/20, médiane 28-37 mondes, 20/20 coupés | **sens confirmé, amplitude infirmée** : la Générale est plus fréquente quand l'horloge ralentit (5 % à 15-20 %), pas 75 % |
| OUV-3 | `9H 10H 8H 7H JS 9S 7S AD` (reconstruit) | 100♥ plutôt que 90♠ | 100♥ ×20 | **confirmé** |
| OUV-4 | 4e après 3 passes, `JH AS 8S 7S AD 8D 7D 7C` | 80♥ dans 17 cas sur 20 | 80♥ ×19, passe ×1 | **confirmé** |
| OUV-5 | premier, `AH QH 8H 7H AS 8S 7D 8C` | ouvre 9 fois sur 16 | 80♥ ×12, passe ×8 (séries : 15 et 15 ouvertures) | **confirmé** : la même main ouvre ou passe selon la graine |
| OUV-6 | capot avec V-9-7 face à A-10-R | capot inexplicable pour un partenaire | main non citée. Sur la main d'OUV-1 : 250♥ ×2 sur 20 (0 dans deux autres séries) | **non reproduit** (cas introuvable) ; rare sur la seule main testée |
| ENC-1 | 40 donnes × 5 graines, enchères complètes | contrat final différent dans 24 donnes sur 40, camp preneur dans 13 | 24 donnes × 5 graines : contrat 13/24 (54 %), camp 6/24 (25 %) | **confirmé** (60 % et 32 % annoncés) |
| ENC-2 | `JH AH 8H 7H AS 9S 8D 7C` sur 80♠ adverse (`P 80♠ P P`) | 90♥ 14/20 ; 20/20 à 2 ms/monde ; passe 20/20 à 25 ms/monde | figée : 90♥ ×12, 100♥ ×8. ×10 : mêmes réponses, 20/20 coupés. ×30 : passe 4 à 9/20, médiane 1 monde | **nuancé** : instabilité et effet de l'appareil réels ; la passe n'atteint pas 20/20 (séquence reconstruite avec les passes des sièges 2 et 3, absentes du scénario d'origine) |
| ENC-3 | idem (hypothèse : c'est la main d'ENC-2) | 90♥ 70 %, 100♥ 30 % avec la même main | 90♥ 60 %, 100♥ 40 % | **confirmé**. Le rapport ne cite pas de main pour ENC-3 ; le 14/20 d'ENC-2 colle au 70 % |
| ENC-4 | `7H AD 10D 9D AC KC 8S 7S` (complétée) sur `P P 80♥ 90♠` | 100♥ dans 10 cas sur 16 | 100♥ ×10, passe ×9, 100♦ ×1 | **confirmé** (50 % contre 62 %), et la décision est une bascule passe/relance |
| ENC-5a | ouvreur `JH 9H AH 7H 10H AS 8S 9D`, `120♥ P 140♥ P` | l'ouvreur passe 10 fois sur 10 | passe ×20 | **confirmé** (comportement) |
| ENC-5b | même ouvreur, partenaire 130♥ (2 As) | témoin | passe ×20 | **nuancé** : passe aussi avec 2 As ; l'outil ne dit pas si la cause est la lecture décalée ou autre chose |
| ENC-6a/b | `JS 9S QS 8S 7S AH AD AC` en ouverture / sur 80♥ du partenaire | Générale préférée au capot à égalité | ouverture : 250♠ ×20 (série : 500♠ ×1) ; sur 80♥ : 250♠ ×16, 500♠ ×4 | **non mesurable en fréquence** (c'est un `>` dans le code) ; la Générale ne sort que 0 à 20 % du temps |
| COI-6a/b/c | `AH AD AC 10H 10D 10C KH KD` (complétée), défense, 120♠ / 140♠ / 160♠ | 140♠ : 100 %, 120♠ : 2,5 % | 120♠ : oui ×3 (séries : 0 et 0) ; 140♠ : 20/20 ; 160♠ : 20/20 | **confirmé** |
| COI-ctl | `JS 9S 7S AH 8H AD 8D 7C` contre 130♠ | coinche stable | oui ×20 | **confirmé** |
| COI-1 | surcoinche `JS 9S 7S 8S AH AD 7D 7C`, 100/120/130♠, aggr 0,75 et 1,35 | 69 % à 100 % selon la personnalité | 100♠ et 120♠ : 20/20 aux deux aggr ; 130♠ : 13/20 à 0,75, 20/20 à 1,35 | **confirmé mais seulement au-dessus de ~130** : plus bas, la simulation (p ≥ 0,9) décide avant le tirage |
| COI-3 | `JS 7H 8H 9H 7D 8D 7C 8C` contre 100♠ | coinche sans raison sur appareil lent (3 à 5 %) | non ×20 à ×10 et à ×30 (médiane 1-2 mondes) | **infirmé sur ce cas**. Le chiffre global est confirmé en volet 2 : 6 % des coinches changent à ×10, 84 % coupées, 30 % sous 24 mondes |
| ENT-1 / ENT-7 | défense, `10S AD 8D 7D AC 9C 8C 7H` contre 80♥ | 6 cartes différentes sur 20 graines ; le 10 sec peut sortir | 10♠ ×17, A♣ ×3 ; réflexe 10♠ (séries : 3 à 4 cartes). Sièges 2-3 humains : 3 cartes | **10 sec confirmé** (le réflexe l'entame, le jeu final aussi, 85 %) ; **« 6 cartes » infirmé** (2 à 4) |
| ENT-1b | défense, `10S 10C JD 10H QH QC 8C KD`, atout ♦ (80 supposé) | 6 entames sur 8 graines, dont le Valet d'atout | 6 cartes sur 20 (8♣ 7, D♣ 7, 10♥ 2, D♥ 2, 10♣ 1, 10♠ 1), jamais le Valet d'atout | **instabilité confirmée, Valet non retrouvé** (montant du contrat inconnu) |
| ENT-2 | défense, `9D AC 7S 10C QD 8C 10D AD` contre 130♠ | entame son 7♠ sec au lieu de l'As de carreau | A♣ ×9, A♦ ×5, 10♦ ×3, 10♣ ×1, 7♠ ×1, D♦ ×1 ; réflexe A♦ (séries : 7♠ 1 et 0) | **nuancé** : l'atout sec sort dans 0 à 5 % des tirages ; le vrai défaut ici est l'As de trèfle contre l'As de carreau (6 cartes). La main a deux As, le rapport n'en cite qu'un |
| ENT-3 | preneur 110♣, `7D AH JC 9C QC 10S 9D AD`, entame | 7♦ sur les 3 tirages, ne tire pas atout | 7♦ ×12, 9♦ ×8, atout 0/20 ; réflexe J♣ | **confirmé** |
| EMP-3a | preneur 100♥, `JH 9H 7H AS 8S KD 7D 8C` | le Valet n'est joué sur aucune des 20 graines | Valet 0/20 : 8♣ ×7, 8♠ ×5, R♦ ×5, 7♦ ×3 ; réflexe J♥ | **confirmé** |
| EMP-3b/c/d | 4 atouts V-9 ; V sans 9 ; sans Valet | V+9 (3 atouts ou plus) : atout entamé 33 % ; V sans 9 : 67 % | atout entamé 85 %, 90 %, 95 % | **nuancé** : le défaut se voit sur 3 atouts (EMP-3a, 0 %), pas à 4 (85 %) |
| ENT-4a | défense, `QS 8S KD 9D 7D 9C 8C 7H`, partenaire 80♠, adversaire 90♥ | s'écarte de la couleur annoncée par le partenaire (60 %) | ♠ entamé 30 % (écart 70 %) ; humains : 30 % | **confirmé** |
| ENT-4b | défense, pli 2, le partenaire (siège 3) a défaussé 7♠ au pli 1 | s'écarte de la couleur appelée (45 %) | ♠ entamé 40 % (écart 60 %) ; humains : 45 % | **confirmé**. Scénario source incohérent, reconstruit |
| ENT-C | preneur 80♥, 7♠ entamé, `AS KS JS 9H 8H AD 7C 8C` (reconstruite) | As, Roi ou Valet selon la graine | A♠ ×11, R♠ ×9, Valet jamais ; réflexe J♠ | **nuancé** : As ou Roi seulement ; main, atout et montant absents du rapport |
| SUI-4a/a2 | 4e à jouer, Dame du partenaire gagne, 10♣ 7♣ (a) ou 10♣ R♣ 7♣ (a2), plis 1-2 en atout | le réflexe refuse de charger le 10 sous la Dame | réflexe : 7♣ (refuse). Carte jouée : 10♣ ×18 (a), 10♣ ×11, 7♣ ×7, R♣ ×2 (a2) | **réflexe confirmé, carte jouée infirmée** : le Monte-Carlo corrige le réflexe |
| SUI-4b | As et 10♦ tombés, partenaire gagne de l'As, R♦ V♦ en main | donne parfois un Roi devenu maître | réflexe : R♦. Carte jouée : V♦ ×20 | **réflexe confirmé, carte jouée infirmée** |
| SUI-5 | défausse libre, partenaire a appelé ♣ (7♣ au pli 2), 10♣ 8♣ | le 10 « menacé » est donné dans la couleur appelée | réflexe 10♣ ; carte jouée 10♣ ×20 | **confirmé** |

Cas de la vague 1 sans équivalent dans le corpus, et pourquoi :

- **Volet statistique (§3)** : MCD-1 / MCD-2 (instabilité et lenteur des cartes), EMP-1 à EMP-4, COI-2, SUI-1/SUI-2/SUI-8, ENT-5/ENT-6, ENC-7.
- **Hors du moteur de décision** : COI-4, COI-5, HAS-* (hôte et rythme), MON-* (justesse des mondes : `tests/coinche-justesse.js`).
- **Cas introuvable** : OUV-6, ENC-8 (le rapport consolidé ne cite ni main ni séquence).

### Défauts de description relevés dans le rapport de la vague 1

- **ENT-4b (appel du partenaire)** : le scénario source donne 8 cartes à un joueur qui a déjà joué un pli, et l'As de carreau qu'il aurait joué n'est pas dans sa main. Reconstruit avec une main de 8 cartes complète.
- **ENC-3** : aucune main citée. **OUV-6** : aucune main. **ENC-8** : rien.
- **OUV-3, ENC-4, COI-6, ENC-5** : mains citées par leurs motifs seulement (« 9-10-8-7 de cœur », « 3 As + 3 dix »). Complétées d'après les scripts de la vague 1, qui ne sont pas versionnés.
- **ENT-1b** : le montant du contrat n'est pas cité (80 supposé). **ENT-C** (« preneur en second sur 7♠ avec A♠ R♠ V♠ ») : ni le reste de la main, ni l'atout, ni le montant.
- **ENT-2** : la main a deux As (A♣ et A♦). Le rapport ne parle que de l'As de carreau, mais le jeu final préfère l'As de trèfle.
- **Sièges humains non dits** : les scénarios d'entame de la vague 1 avaient les sièges 2 et 3 humains. Le rapport parle de bots. Les variantes à sièges humains du corpus (suffixe `h`) donnent le même résultat, sauf marginalement.
- **Séquences d'enchères sans les passes** : ENC-2 et ENC-4 étaient posés avec une liste d'annonces sans les passes des sièges 2 et 3. L'outil joue la séquence complète.
- **SUI-4, SUI-5** : posés sans plis joués. L'outil rejoue deux plis préalables, donc des atouts tombés (SUI-4a : plus aucun atout dehors). La comparaison est qualitative.
- **Définitions** : « 33 % » du preneur V+9 et « 74 sur 90 » du réflexe (défense, As) ne sont pas redéfinis dans le rapport. Voir l'écart plus bas.

## 3. Ligne de base (moteur actuel, `b548853`)

Sortie complète de l'outil, `node tests/coinche-lisibilite.js src/coinche/engine.js 16 5 96` (16 parties pour la précision ; les défauts en jouent 10). Les rangs « ↳ ×10 » et « ↳ ×30 » du corpus utilisent l'horloge CPU et varient un peu d'un lancement à l'autre.


### Lisibilité des bots — src/coinche/engine.js, 16 parties, 11.5 min

16 parties, 183 donnes, 1494 positions rejouées ; graines 5, mondes 96, horloge lente ×10.

#### 1. Instabilité : même état, 5 graines, horloge figée

Une décision est « instable » si les 5 graines ne donnent pas toutes la même réponse. « Hors réponse majoritaire » : part moyenne des tirages qui s’écartent de la réponse la plus fréquente.

| décision | positions | instables | hors réponse majoritaire | réponses distinctes (moy.) |
|---|---|---|---|---|
| enchères | 378 | 12 % | 3 % | 1.12 |
| entames | 479 | 48 % | 19 % | 1.73 |
| suites (2e à 4e) | 297 | 21 % | 6 % | 1.22 |
| cartes (entames + suites) | 776 | 38 % | 14 % | 1.54 |
| cartes, plis 1 à 3 | 333 | 59 % | 23 % | 1.92 |
| 1re entame de la défense | 70 | 83 % | 38 % | 2.61 |
| coinches | 296 | 2 % | 1 % | 1.02 |
| surcoinches | 44 | 0 % | 0 % | 1.00 |

Enchères instables, nature du changement : passe-ou-annonce 42, montants-differents 2.

#### 2. Sensibilité à l’appareil : horloge ×10 contre horloge figée, mêmes graines

« Réponse différente » : part des (position, graine) dont la réponse change. « Coupées » : part des tirages arrêtés avant la fin de leurs mondes (< 24 : sous le plancher du capot).

| décision | positions | réponse différente | réponse majoritaire différente | coupées avant la fin | coupées avant 24 mondes | instables en lent |
|---|---|---|---|---|---|---|
| enchères | 378 | 3 % | 2 % | 64 % | 20 % | 16 % |
| entames | 479 | 13 % | 13 % | 49 % | 1 % | 53 % |
| suites (2e à 4e) | 297 | 1 % | 0 % | 11 % | 0 % | 20 % |
| cartes (entames + suites) | 776 | 9 % | 8 % | 34 % | 1 % | 40 % |
| cartes, plis 1 à 3 | 333 | 19 % | 18 % | 71 % | 1 % | 65 % |
| 1re entame de la défense | 70 | 34 % | 37 % | 89 % | 3 % | 89 % |
| coinches | 296 | 6 % | 4 % | 84 % | 30 % | 18 % |
| surcoinches | 44 | 8 % | 7 % | 46 % | 25 % | 20 % |

#### 3. Conventions, sur les décisions des parties jouées

« réflexe » : part où le réflexe (heuristicCard) viole la convention ; « final » : part où la carte réellement jouée la viole. Les décisions forcées (une seule carte légale) sont exclues : 2029 forcées sur 5856 coups de carte. Pour les enchères, seule la colonne « final » existe.

| convention violée | n | réflexe | final | attendu |
|---|---|---|---|---|
| défense qui entame atout (entame avec choix, tous plis) | 247 | 0.0 % | 18.2 % | jamais |
| défense qui entame atout au pli 1 | 82 | 0.0 % | 26.8 % | jamais |
| preneur V+9, 3 atouts ou plus, atouts adverses encore dehors : n’entame pas atout | 25 | 0.0 % | 32.0 % | tire atout |
| idem, avec exactement 3 atouts | 10 | 0.0 % | 40.0 % | tire atout |
| témoin : preneur Valet sans le 9, 3 atouts ou plus : n’entame pas atout | 40 | 0.0 % | 22.5 % | tire atout |
| idem, au pli 1 seulement | 9 | 0.0 % | 33.3 % | tire atout |
| entame d’atout du réflexe (attaque) refusée par le Monte-Carlo | 371 | 0.0 % | 36.7 % | garder le réflexe |
| défense, 1re entame de la donne avec un As hors atout : n’entame pas un As | 81 | 38.3 % | 70.4 % | entame l’As |
| idem, au pli 1 seulement | 49 | 55.1 % | 73.5 % | entame l’As |
| vrai appel du réflexe (petite carte sous l’As) écrasé par le Monte-Carlo | 97 | 0.0 % | 53.6 % | garder l’appel |
| relance dans la couleur du partenaire sans J, 9, A ni 10 | 155 | – | 25.2 % | un honneur ou 2 atouts |
| idem, avec au plus 1 atout | 155 | – | 11.6 % | un honneur ou 2 atouts |
| idem, au-dessus d’une enchère adverse | 116 | – | 21.6 % | un honneur ou 2 atouts |
| surenchère sur l’adversaire sans le Valet | 255 | – | 45.1 % | Valet |
| surenchère sur l’adversaire sans Valet ni 9 | 255 | – | 23.5 % | Valet ou 9 |
| carte jouée ≠ réflexe (toutes cartes avec choix) | 3827 | 0.0 % | 32.6 % | (information) |

Signaux de défausse lus (readDiscardSignal), 287 appels et 240 refus lus :

| lecture | n | part |
|---|---|---|
| appels lus faux (le défausseur n’a pas l’As de la couleur) | 287 | 83.3 % |
| appels lus sur une couleur dont l’As est déjà tombé | 287 | 51.9 % |
| refus lus avec l’As en main | 240 | 11.3 % |
| refus lus sur un Valet (le bot n’émet un refus qu’avec R ou D) | 240 | 29.2 % |

Donnes à 6 enchères ou plus (hors passes) : 11 sur 183 (6.0 %). Coinches : 24 sur 499 décisions ; surcoinches : 5 sur 44.

#### 4. Corpus : 20 graines, horloge figée, 96 mondes

« suivi » : part des graines qui font le comportement dont parle le rapport vague 1. Horloge lente : ×10 puis ×30 (mondes médians joués, tirages coupés).

| cas | situation | annoncé (vague 1) | réponses sur 20 graines | réflexe | suivi |
|---|---|---|---|---|---|
| OUV-1 | premier, J-9-7 + A-10-K + A-10 (barème 160♥) | passe 10 donnes sur 30, alors que p(80♥) ≈ 1 | 160♥×16 250♥×2 P×2 | – | passe : 10 % |
| OUV-2 | premier, J-9-8-7-Q + A-10-K (Générale ?) | 500♥ : 3/16 vitesse réelle, 12/16 à ×20 | 250♥×19 500♥×1 | – | 500♥ : 5 % |
| ↳ ×10 | | | 250♥×19 500♥×1 | mondes médian 96, 1 coupés | 5 % |
| ↳ ×30 | | | 250♥×15 500♥×5 | mondes médian 34, 20 coupés | 25 % |
| OUV-3 | premier, 9-10-8-7♥ ; J-9-7♠ ; AD | 100♥ plutôt que 90♠ (couleur au montant) | 100♥×20 | – | 100♥ : 100 % |
| OUV-4 | 4e après 3 passes, Valet sec + As | 80♥ dans 17 cas sur 20 | 80♥×19 P×1 | – | 80♥ : 95 % |
| OUV-5 | premier, A-Q-8-7♥ + As (80 hors barème) | ouvre 9 fois sur 16, passe sinon | 80♥×12 P×8 | – | ouvre : 60 % |
| ENC-2 | J-A-8-7♥ + As♠ sur 80♠ adverse (P 80♠ P P) | 90♥ 14/20 ; 20/20 à 2 ms/monde ; passe 20/20 à 25 ms/monde ; 90 ou 100 tiré au sort (70/30) | 90♥×12 100♥×8 | – | 90♥ : 60 % |
| ↳ ×10 | | | 90♥×15 100♥×5 | mondes médian 36, 20 coupés | 75 % |
| ↳ ×30 | | | P×16 100♥×2 90♥×2 | mondes médian 1, 20 coupés | 10 % |
| ENC-4 | relance dans ♥ du partenaire, 7♥ sec + A-10♦ + A♣, sur 90♠ adverse | 100♥ dans 10 cas sur 16 | 100♥×10 P×9 100♦×1 | – | 100♥ : 50 % |
| ENC-5a | ouvreur 120♥ (2 fausses), partenaire 140♥ (« 3 As ») | l’ouvreur passe 10 fois sur 10 | P×20 | – | passe : 100 % |
| ENC-5b | ouvreur 120♥, partenaire 130♥ (« 2 As ») | témoin : la lecture des clefs est décalée d’un As | P×20 | – | passe : 100 % |
| ENC-6a | ouvreur, J-9-Q-8-7♠ + 3 As (Générale ou capot ?) | Générale préférée au capot à probabilité égale | 250♠×20 | – | 500♠ : 0 % |
| ENC-6b | même main, sur 80♥ du partenaire (P P 80♥ P) | idem | 250♠×16 500♠×4 | – | 500♠ : 20 % |
| COI-6a | défense sans atout, 3 As + 3 dix + 2 Rois, contre 120♠ | 2,5 % de coinches | non×17 oui×3 | – | coinche : 15 % |
| COI-6b | même main contre 140♠ | 100 % de coinches | oui×20 | – | coinche : 100 % |
| COI-6c | même main contre 160♠ | témoin | oui×20 | – | coinche : 100 % |
| COI-ctl | J-9-7♠ + 2 As contre 130♠ | coinche stable (100 %) | oui×20 | – | coinche : 100 % |
| COI-3 | J♠ sec + 7 petites cartes contre 100♠ (cas limite) | coinche sans raison sur appareil lent (3 à 5 %) | non×20 | – | coinche : 0 % |
| ↳ ×10 | | | non×20 | mondes médian 90, 14 coupés | 0 % |
| ↳ ×30 | | | non×18 oui×2 | mondes médian 1, 20 coupés | 10 % |
| COI-1/100/0.75 | surcoinche 100♠ (coincheur : siège 1), J-9-7-8♠ + 2 As, personnalité aggr 0.75 | même main : surcoinche 69 % à 100 % selon la personnalité (Math.random() < 0,8 × aggr) | oui×20 | – | surcoinche : 100 % |
| COI-1/100/1.35 | surcoinche 100♠ (coincheur : siège 1), J-9-7-8♠ + 2 As, personnalité aggr 1.35 | même main : surcoinche 69 % à 100 % selon la personnalité (Math.random() < 0,8 × aggr) | oui×20 | – | surcoinche : 100 % |
| COI-1/120/0.75 | surcoinche 120♠ (coincheur : siège 1), J-9-7-8♠ + 2 As, personnalité aggr 0.75 | même main : surcoinche 69 % à 100 % selon la personnalité (Math.random() < 0,8 × aggr) | oui×20 | – | surcoinche : 100 % |
| COI-1/120/1.35 | surcoinche 120♠ (coincheur : siège 1), J-9-7-8♠ + 2 As, personnalité aggr 1.35 | même main : surcoinche 69 % à 100 % selon la personnalité (Math.random() < 0,8 × aggr) | oui×20 | – | surcoinche : 100 % |
| COI-1/130/0.75 | surcoinche 130♠ (coincheur : siège 1), J-9-7-8♠ + 2 As, personnalité aggr 0.75 | même main : surcoinche 69 % à 100 % selon la personnalité (Math.random() < 0,8 × aggr) | oui×13 non×7 | – | surcoinche : 65 % |
| COI-1/130/1.35 | surcoinche 130♠ (coincheur : siège 1), J-9-7-8♠ + 2 As, personnalité aggr 1.35 | même main : surcoinche 69 % à 100 % selon la personnalité (Math.random() < 0,8 × aggr) | oui×20 | – | surcoinche : 100 % |
| ENT-1 | défense, 1re entame, 10♠ sec + A-8-7♦ + A-9-8♣ + 7♥ contre 80♥ | 6 cartes différentes sur 20 graines ; le 10 sec peut sortir | 10♠×17 A♣×3 | 10♠ | atout 7♥ : 0 % |
| ENT-1b | défense, 1re entame, 10♠ 10♣ V♦ 10♥ D♥ D♣ 8♣ R♦, atout ♦ (montant non cité : 80) | 6 entames sur 8 graines, dont le Valet d’atout | 8♣×7 Q♣×7 10♥×2 Q♥×2 10♣×1 10♠×1 | 8♣ | entame atout ♦ : 0 % |
| ENT-2 | défense, 1re entame, A♣ A♦ 10♦ … contre 130♠ | entame son 7♠ sec au lieu de l’As de carreau | A♣×9 A♦×5 10♦×3 10♣×1 7♠×1 Q♦×1 | A♦ | 7♠ (atout) : 5 % |
| ENT-3 | preneur 110♣ entame, J-9-D♣ + A♥ + 10♠ + A-9-7♦ | entame 7♦ sur les 3 tirages, ne tire pas atout | 7♦×12 9♦×8 | J♣ | tire atout ♣ : 0 % |
| EMP-3a | preneur 100♥, J-9-7♥ + A♠ 8♠ R♦ 7♦ 8♣ | le Valet n’est joué sur aucune des 20 graines | 8♣×7 8♠×5 K♦×5 7♦×3 | J♥ | Valet ♥ : 0 % |
| EMP-3b | idem avec 4 atouts J-9-8-7♥ | Valet + 9 + 3 atouts ou plus : atout entamé 33 % | J♥×10 9♥×7 7♦×2 K♦×1 | J♥ | tire atout : 85 % |
| EMP-3c | Valet sans le 9 (J-8-7♥), 100♥ | Valet sans 9 : atout entamé 67 % (relation inversée) | J♥×16 8♥×2 8♣×1 K♦×1 | J♥ | tire atout : 90 % |
| EMP-3d | sans Valet (9-A-8-7♥), 80♥ | témoin | 7♥×19 8♣×1 | 7♥ | tire atout : 95 % |
| ENT-4a | défense, 1re entame, partenaire a annoncé 80♠, adversaire 90♥ | le MC s’écarte de la couleur annoncée par le partenaire (60 %) | 9♣×5 K♦×4 Q♠×4 7♦×2 8♠×2 9♦×2 7♥×1 | 8♠ | ♠ du partenaire : 30 % |
| ENT-4b | défense, pli 2 : le partenaire (siège 3) a défaussé 7♠ au pli 1 (appel) | le MC s’écarte de la couleur appelée (45 %) — scénario source incohérent, reconstruit | 8♣×9 8♠×8 Q♦×3 | 8♠ | ♠ appelé : 40 % |
| ENT-C | preneur 80♥, 7♠ entamé par la défense, A-R-V♠ (main reconstruite) | As, Roi ou Valet selon la graine (main non citée dans le rapport) | A♠×11 K♠×9 | J♠ | As : 55 % |
| SUI-4a | 4e à jouer, Dame du partenaire gagne, 10♣ 7♣ en main (plis 1-2 : atouts) | refuse de charger le 10 sous la Dame du partenaire | 10♣×18 7♣×2 | 7♣ | charge le 10♣ : 90 % |
| SUI-4a2 | idem avec 10♣ R♣ 7♣ | idem | 10♣×11 7♣×7 K♣×2 | 7♣ | charge le 10♣ : 55 % |
| SUI-4b | As et 10♦ tombés, le partenaire gagne de l’As, R♦ V♦ en main | donne parfois un Roi devenu maître | J♦×20 | K♦ | donne le Roi : 0 % |
| SUI-5 | défausse libre, le partenaire a appelé ♣ (7♣ au pli 2), 10♣ 8♣ en main | 10 « menacé » donné dans la couleur appelée | 10♣×20 | 10♣ | défausse le 10♣ : 100 % |
| ENT-1h | défense, 1re entame, 10♠ sec + A-8-7♦ + A-9-8♣ + 7♥ contre 80♥ — sièges 2 et 3 humains | 6 cartes différentes sur 20 graines ; le 10 sec peut sortir | 10♠×14 9♣×5 8♦×1 | 10♠ | atout 7♥ : 0 % |
| ENT-1bh | défense, 1re entame, 10♠ 10♣ V♦ 10♥ D♥ D♣ 8♣ R♦, atout ♦ (montant non cité : 80) — sièges 2 et 3 humains | 6 entames sur 8 graines, dont le Valet d’atout | Q♣×8 10♠×5 8♣×4 Q♥×3 | 8♣ | entame atout ♦ : 0 % |
| ENT-2h | défense, 1re entame, A♣ A♦ 10♦ … contre 130♠ — sièges 2 et 3 humains | entame son 7♠ sec au lieu de l’As de carreau | A♦×13 A♣×5 10♦×1 7♠×1 | A♦ | 7♠ (atout) : 5 % |
| EMP-3ah | preneur 100♥, J-9-7♥ + A♠ 8♠ R♦ 7♦ 8♣ — sièges 2 et 3 humains | le Valet n’est joué sur aucune des 20 graines | 8♣×7 8♠×5 7♦×4 K♦×4 | J♥ | Valet ♥ : 0 % |
| ENT-4ah | défense, 1re entame, partenaire a annoncé 80♠, adversaire 90♥ — sièges 2 et 3 humains | le MC s’écarte de la couleur annoncée par le partenaire (60 %) | 9♣×6 Q♠×4 9♦×3 K♦×3 7♦×2 8♠×2 | 8♠ | ♠ du partenaire : 30 % |
| ENT-4bh | défense, pli 2 : le partenaire (siège 3) a défaussé 7♠ au pli 1 (appel) — sièges 2 et 3 humains | le MC s’écarte de la couleur appelée (45 %) — scénario source incohérent, reconstruit | 8♣×10 8♠×9 Q♦×1 | 8♠ | ♠ appelé : 45 % |

#### 5. Enchères complètes entre bots : 24 donnes × 5 graines de bots

| mesure | valeur |
|---|---|
| donnes dont le contrat final change d’une graine à l’autre | 13 sur 24 (54 %) |
| donnes dont le camp preneur change | 6 sur 24 (25 %) |
| enchères à 6 annonces ou plus (hors passes) | 5 sur 120 (4.2 %) |


## 4. Comparaison des chiffres globaux avec la vague 1

| mesure | vague 1 | ligne de base ci-dessus | lecture |
|---|---|---|---|
| carte instable (toutes positions) | 18 à 38 % | 38 % (n = 776) | confirmé |
| carte instable, plis 1 à 3 | 52 à 66 % | 59 % (n = 333) | confirmé |
| 1re entame de la défense instable | 79 % | 83 % (n = 70) | confirmé |
| enchère instable | 13 %, bascule passe/annonce | 12 %, 42 changements sur 44 passe/annonce | confirmé |
| coinche instable | 0 sur 44, jusqu'à 8 % | 2 % (n = 296) | confirmé (quelques cas limites) |
| contrat final change sur donne complète | 24/40 | 13/24 | confirmé |
| cartes plis 1-3 changées à ×10 | 21 % | 19 % | confirmé |
| décisions de carte coupées avant 96 mondes à ×10 | 41 % | 34 % (71 % aux plis 1-3) | confirmé |
| défense entame atout | 15 % | 18 % (n = 247), réflexe 0 % | confirmé |
| carte jouée ≠ réflexe | 32 % | 32,6 % | confirmé |
| entame d'atout du réflexe refusée par le MC | 39 % | 36,7 % (n = 371) | confirmé |
| vrais appels du réflexe écrasés | 114 sur 195 (58 %) | 53,6 % (n = 97) | confirmé |
| appels lus faux | 73 % (réflexe), 84 % (MC) | 83,3 % (n = 287, jeu final) | confirmé |
| appels sur une couleur dont l'As est tombé | 49 % | 51,9 % | confirmé |
| surenchère sans Valet / sans Valet ni 9 | 51 % / 27 % (n = 446) | 45 % / 23,5 % (n = 255) | confirmé |
| donnes à 6 enchères ou plus | 18 sur 200 (9 %) | 11 sur 183 (6 %) | même ordre de grandeur |
| défense, 1re entame avec As : n'entame pas un As | réflexe 18 % (16/90), final 67 % | pli 1 : réflexe 55 %, final 73,5 % (n = 49) | **final confirmé, réflexe non** : la définition de la vague 1 n'est pas connue |
| preneur V+9 ne tire pas atout | 67 % au 1er pli | 32 % (n = 25), 33 % au pli 1 (n = 9), 40 % à exactement 3 atouts (n = 10) | **non confirmé tel quel** : le défaut existe (réflexe 0 %) mais moins grand |
| témoin preneur V sans 9 ne tire pas atout | 33 % | 22,5 % (n = 40) | l'inversion V+9 / V sans 9 est faible ici |

## 5. Limites

- **Échantillons.** Les rubriques sur la 1re entame de la défense, le preneur V+9 et les refus reposent sur 9 à 80 décisions. Les ordres de grandeur sont fiables, pas les unités.
- **Corpus à 20 graines.** Le bruit est de l'ordre de 3 graines (voir le mode d'emploi). Les verdicts se fondent sur des écarts nets, ou sur plusieurs séries de graines quand il y en a.
- **Horloge lente.** CPU × k, pas un vrai téléphone. Elle reproduit le fait que la génération des mondes use le budget, mais pas le coût d'un autre navigateur.
- **Positions.** Les parties jouées sont entre quatre bots : aucune position ne vient d'un humain, donc la lecture des humains (C5) n'est pas couverte. Les variantes `h` du corpus ne changent que le type de siège dans la vue du bot.
- **Reconstructions.** Plusieurs cas (liste plus haut) ont une main ou une séquence complétée ; leur verdict dit « le comportement existe sur cette reconstruction », pas « le chiffre du rapport est exact ».
- **Défauts de l'outil.** Il ne mesure ni la lecture des enchères ni les mondes (`tests/coinche-justesse.js`), ni les défauts d'hôte. La mesure des signaux compte les crochets sur `readDiscardSignal` des seules parties jouées.
