// =============================================================================
// writing.js — Schreiben module for B1 Goethe Trainer
// =============================================================================

'use strict';

const WritingModule = (() => {

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let container = null;
  let data = null;
  let currentPrompt = null;
  let currentType = null;
  let _toolbarHandler = null;

  // ---------------------------------------------------------------------------
  // Writing Prompts
  // ---------------------------------------------------------------------------

  const writingPrompts = {
    email: [
      {
        type: 'email',
        title: 'Terminverschiebung',
        situation: 'Sie haben einen Termin beim Arzt, können aber nicht kommen. Schreiben Sie eine E-Mail an die Arztpraxis.',
        points: [
          'Grund für die Absage erklären',
          'Um einen neuen Termin bitten',
          'Sich für die Unannehmlichkeiten entschuldigen',
        ],
        minWords: 80,
        sampleResponse: 'Sehr geehrte Damen und Herren,\n\nleider muss ich meinen Termin am Donnerstag, den 15. März, um 10:00 Uhr absagen. Der Grund dafür ist, dass ich an diesem Tag eine dringende berufliche Verpflichtung habe, die sich nicht verschieben lässt.\n\nIch bitte Sie herzlich, mir einen neuen Termin in der darauffolgenden Woche zu geben. Am besten würde es mir am Dienstag oder Mittwoch vormittags passen.\n\nIch entschuldige mich aufrichtig für die entstandenen Unannehmlichkeiten und hoffe, dass sich ein passender Ersatztermin finden lässt.\n\nMit freundlichen Grüßen\nAnna Müller',
        keyPhrases: ['Sehr geehrte Damen und Herren', 'leider muss ich', 'wäre es möglich', 'Ich bitte Sie herzlich', 'Mit freundlichen Grüßen'],
        checklist: ['Formelle Anrede', 'Alle drei Punkte bearbeitet', 'Höfliche Formulierungen', 'Passender Schluss', 'Mindestens 80 Wörter'],
      },
      {
        type: 'email',
        title: 'Beschwerde über eine Bestellung',
        situation: 'Sie haben online ein Buch bestellt, aber ein falsches Buch erhalten. Schreiben Sie eine E-Mail an den Online-Shop.',
        points: [
          'Beschreiben, was Sie bestellt haben und was Sie erhalten haben',
          'Um Umtausch oder Rückerstattung bitten',
          'Eine Frist für die Bearbeitung setzen',
        ],
        minWords: 80,
        sampleResponse: 'Sehr geehrte Damen und Herren,\n\nam 5. Februar habe ich über Ihren Online-Shop das Buch „Deutsche Grammatik leicht gemacht" (Bestellnummer 4712) bestellt. Leider habe ich stattdessen einen Roman erhalten, der nicht meiner Bestellung entspricht.\n\nIch bitte Sie, mir entweder das richtige Buch zuzusenden oder den Kaufpreis von 24,90 Euro zu erstatten. Das falsche Buch sende ich Ihnen selbstverständlich auf Ihre Kosten zurück.\n\nIch wäre Ihnen dankbar, wenn Sie sich bis zum 20. Februar um diese Angelegenheit kümmern könnten.\n\nMit freundlichen Grüßen\nMax Schneider',
        keyPhrases: ['Bestellnummer', 'leider habe ich stattdessen', 'Ich bitte Sie', 'Rückerstattung', 'Ich wäre Ihnen dankbar'],
        checklist: ['Formelle Anrede', 'Alle drei Punkte bearbeitet', 'Höfliche Formulierungen', 'Passender Schluss', 'Mindestens 80 Wörter'],
      },
      {
        type: 'email',
        title: 'Einladung absagen',
        situation: 'Ein Freund hat Sie zu seiner Geburtstagsfeier eingeladen, aber Sie können leider nicht kommen. Schreiben Sie ihm eine E-Mail.',
        points: [
          'Sich für die Einladung bedanken',
          'Den Grund für die Absage erklären',
          'Ein alternatives Treffen vorschlagen',
        ],
        minWords: 80,
        sampleResponse: 'Lieber Thomas,\n\nvielen herzlichen Dank für die Einladung zu deiner Geburtstagsfeier am Samstag! Ich habe mich sehr darüber gefreut.\n\nLeider muss ich dir mitteilen, dass ich an diesem Wochenende nicht kommen kann, da meine Eltern aus Spanien zu Besuch kommen und ich sie vom Flughafen abholen muss.\n\nIch würde dich gerne in der Woche darauf zum Abendessen einladen, damit wir deinen Geburtstag nachfeiern können. Hättest du am Mittwoch oder Donnerstag Zeit?\n\nIch wünsche dir eine wundervolle Feier!\n\nHerzliche Grüße\nSophie',
        keyPhrases: ['Vielen Dank für die Einladung', 'Leider muss ich', 'Ich würde dich gerne', 'Hättest du Zeit', 'Herzliche Grüße'],
        checklist: ['Persönliche Anrede', 'Alle drei Punkte bearbeitet', 'Freundlicher Ton', 'Passender Schluss', 'Mindestens 80 Wörter'],
      },
      {
        type: 'email',
        title: 'Anfrage an die Volkshochschule',
        situation: 'Sie möchten einen Deutschkurs an der Volkshochschule besuchen. Schreiben Sie eine E-Mail mit Ihren Fragen.',
        points: [
          'Sich vorstellen und Ihr Sprachniveau angeben',
          'Nach Kurszeiten und Kosten fragen',
          'Fragen, ob ein Einstufungstest notwendig ist',
        ],
        minWords: 80,
        sampleResponse: 'Sehr geehrte Damen und Herren,\n\nmein Name ist Maria Garcia und ich lebe seit zwei Jahren in Deutschland. Derzeit befinde ich mich auf dem Sprachniveau B1 und möchte gerne meine Deutschkenntnisse weiter verbessern.\n\nKönnten Sie mir bitte mitteilen, wann die nächsten B1- oder B2-Kurse beginnen und wie hoch die Kursgebühren sind? Außerdem wüsste ich gerne, ob vor der Anmeldung ein Einstufungstest abgelegt werden muss.\n\nIch freue mich auf Ihre Antwort und danke Ihnen im Voraus für Ihre Hilfe.\n\nMit freundlichen Grüßen\nMaria Garcia',
        keyPhrases: ['Mein Name ist', 'Könnten Sie mir bitte mitteilen', 'Ich wüsste gerne', 'Ich freue mich auf Ihre Antwort', 'im Voraus'],
        checklist: ['Formelle Anrede', 'Alle drei Punkte bearbeitet', 'Höfliche Formulierungen', 'Passender Schluss', 'Mindestens 80 Wörter'],
      },
      {
        type: 'email',
        title: 'Wohnungssuche',
        situation: 'Sie haben eine Wohnungsanzeige gesehen und interessieren sich für die Wohnung. Schreiben Sie eine E-Mail an den Vermieter.',
        points: [
          'Sich vorstellen und Interesse bekunden',
          'Fragen zur Wohnung stellen (Nebenkosten, Einzugstermin)',
          'Um einen Besichtigungstermin bitten',
        ],
        minWords: 80,
        sampleResponse: 'Sehr geehrter Herr Weber,\n\nmit großem Interesse habe ich Ihre Wohnungsanzeige für die 2-Zimmer-Wohnung in der Schillerstraße gelesen. Ich bin Softwareentwickler, 32 Jahre alt, und suche eine ruhige Wohnung in zentraler Lage.\n\nIch hätte noch einige Fragen: Wie hoch sind die monatlichen Nebenkosten? Und ab welchem Datum wäre die Wohnung verfügbar?\n\nIch würde die Wohnung sehr gerne besichtigen. Wäre es möglich, einen Termin in dieser oder der kommenden Woche zu vereinbaren?\n\nVielen Dank im Voraus für Ihre Rückmeldung.\n\nMit freundlichen Grüßen\nLuca Bianchi',
        keyPhrases: ['mit großem Interesse', 'Ich hätte noch einige Fragen', 'Wäre es möglich', 'einen Termin vereinbaren', 'Vielen Dank im Voraus'],
        checklist: ['Formelle Anrede', 'Alle drei Punkte bearbeitet', 'Höfliche Formulierungen', 'Passender Schluss', 'Mindestens 80 Wörter'],
      },
      {
        type: 'email',
        title: 'Krankmeldung an den Arbeitgeber',
        situation: 'Sie sind krank und können nicht zur Arbeit gehen. Schreiben Sie eine E-Mail an Ihren Vorgesetzten.',
        points: [
          'Mitteilen, dass Sie krank sind',
          'Die voraussichtliche Dauer der Abwesenheit angeben',
          'Anbieten, dringende Aufgaben zu delegieren',
        ],
        minWords: 80,
        sampleResponse: 'Sehr geehrter Herr Hoffmann,\n\nhiermit möchte ich Ihnen mitteilen, dass ich heute leider nicht zur Arbeit kommen kann. Ich bin gestern Abend mit starkem Fieber und Halsschmerzen erkrankt und habe bereits einen Arzttermin für heute Vormittag.\n\nVoraussichtlich werde ich bis Ende der Woche krankgeschrieben sein. Die Arbeitsunfähigkeitsbescheinigung reiche ich Ihnen selbstverständlich umgehend nach.\n\nFalls es dringende Aufgaben gibt, kann meine Kollegin Frau Schneider diese in der Zwischenzeit übernehmen. Ich habe sie bereits informiert.\n\nMit freundlichen Grüßen\nJonas Weber',
        keyPhrases: ['hiermit möchte ich Ihnen mitteilen', 'leider nicht zur Arbeit kommen', 'voraussichtlich', 'Arbeitsunfähigkeitsbescheinigung', 'in der Zwischenzeit übernehmen'],
        checklist: ['Formelle Anrede', 'Alle drei Punkte bearbeitet', 'Höfliche Formulierungen', 'Passender Schluss', 'Mindestens 80 Wörter'],
      },
    ],

    meinung: [
      {
        type: 'meinung',
        title: 'Homeoffice oder Büro?',
        situation: 'In Ihrem Deutschkurs diskutieren Sie über das Thema „Arbeiten von zu Hause oder im Büro". Schreiben Sie Ihre Meinung.',
        points: [
          'Nennen Sie Vorteile und Nachteile des Homeoffice',
          'Berichten Sie von eigenen Erfahrungen',
          'Schreiben Sie, welche Arbeitsform Sie bevorzugen und warum',
        ],
        minWords: 80,
        sampleResponse: 'Meiner Meinung nach hat das Arbeiten von zu Hause sowohl Vor- als auch Nachteile. Einerseits spart man viel Zeit, weil man nicht zur Arbeit fahren muss. Außerdem kann man sich die Arbeitszeit freier einteilen.\n\nAndererseits fehlt im Homeoffice oft der direkte Kontakt zu den Kollegen. Aus meiner eigenen Erfahrung kann ich sagen, dass man sich zu Hause manchmal einsam fühlt und es schwieriger ist, Arbeit und Freizeit zu trennen.\n\nIch persönlich bevorzuge eine Mischung aus beiden Arbeitsformen. Am liebsten arbeite ich zwei Tage von zu Hause und drei Tage im Büro, weil ich so die Vorteile beider Modelle nutzen kann.',
        keyPhrases: ['Meiner Meinung nach', 'Einerseits ... andererseits', 'Aus meiner Erfahrung', 'Ich persönlich bevorzuge', 'Zusammenfassend'],
        checklist: ['Einleitung mit eigener Meinung', 'Vorteile und Nachteile genannt', 'Persönliche Erfahrung', 'Begründete Schlussfolgerung', 'Mindestens 80 Wörter'],
      },
      {
        type: 'meinung',
        title: 'Soziale Medien und Gesundheit',
        situation: 'Sie sollen in einem Forum Ihre Meinung zum Thema „Einfluss sozialer Medien auf die Gesundheit" äußern.',
        points: [
          'Erklären Sie, welche Auswirkungen soziale Medien auf die Gesundheit haben können',
          'Nennen Sie ein Beispiel aus Ihrem Umfeld',
          'Geben Sie einen Ratschlag für einen gesunden Umgang mit sozialen Medien',
        ],
        minWords: 80,
        sampleResponse: 'Ich bin der Überzeugung, dass soziale Medien einen erheblichen Einfluss auf unsere Gesundheit haben können. Besonders junge Menschen verbringen viel Zeit auf Plattformen wie Instagram, was zu Schlafmangel und einem verzerrten Selbstbild führen kann.\n\nIn meinem Freundeskreis habe ich beobachtet, dass eine Freundin ständig ihr Aussehen mit den Fotos von Influencern vergleicht. Das hat sie unglücklich gemacht und ihr Selbstwertgefühl geschwächt.\n\nMein Ratschlag wäre, bewusst Pausen einzulegen und die Bildschirmzeit auf höchstens eine Stunde pro Tag zu begrenzen. Außerdem sollte man sich stets vor Augen führen, dass die Darstellungen in sozialen Medien häufig nicht der Wirklichkeit entsprechen.',
        keyPhrases: ['Ich bin der Überzeugung', 'Besonders', 'In meinem Freundeskreis', 'Mein Ratschlag wäre', 'sich vor Augen führen'],
        checklist: ['Einleitung mit eigener Meinung', 'Auswirkungen erklärt', 'Beispiel aus dem Umfeld', 'Ratschlag gegeben', 'Mindestens 80 Wörter'],
      },
      {
        type: 'meinung',
        title: 'Umweltschutz im Alltag',
        situation: 'Ihre Sprachschule sammelt Texte für ein Magazin zum Thema „Was kann jeder Einzelne für die Umwelt tun?". Schreiben Sie Ihren Beitrag.',
        points: [
          'Erklären Sie, warum Umweltschutz wichtig ist',
          'Nennen Sie drei konkrete Maßnahmen für den Alltag',
          'Beschreiben Sie, was Sie persönlich bereits für die Umwelt tun',
        ],
        minWords: 80,
        sampleResponse: 'Der Schutz unserer Umwelt ist eine der dringendsten Aufgaben unserer Zeit. Wenn wir nicht handeln, werden kommende Generationen die Folgen unserer Nachlässigkeit tragen müssen.\n\nJeder von uns kann im Alltag einen wertvollen Beitrag leisten. Erstens sollte man häufiger das Fahrrad oder öffentliche Verkehrsmittel nutzen statt das Auto. Zweitens ist es sinnvoll, weniger Plastik zu verwenden und beim Einkaufen eigene Taschen mitzubringen. Drittens kann man Energie sparen, indem man das Licht ausschaltet und kürzer duscht.\n\nIch persönlich fahre jeden Tag mit dem Fahrrad zur Arbeit und kaufe mein Obst und Gemüse auf dem Wochenmarkt, um Verpackungsmüll zu vermeiden.',
        keyPhrases: ['eine der dringendsten Aufgaben', 'Jeder von uns', 'Erstens ... Zweitens ... Drittens', 'Ich persönlich', 'einen Beitrag leisten'],
        checklist: ['Einleitung zur Bedeutung', 'Drei konkrete Maßnahmen', 'Persönlicher Beitrag', 'Kohärente Struktur', 'Mindestens 80 Wörter'],
      },
      {
        type: 'meinung',
        title: 'Digitalisierung in der Medizin',
        situation: 'In einem Diskussionsforum wird über „Digitalisierung im Gesundheitswesen" debattiert. Schreiben Sie Ihren Standpunkt.',
        points: [
          'Nennen Sie Vorteile der Digitalisierung für Patienten',
          'Welche Risiken sehen Sie?',
          'Wie stellen Sie sich die Zukunft der digitalen Medizin vor?',
        ],
        minWords: 80,
        sampleResponse: 'Die Digitalisierung im Gesundheitswesen bietet meiner Ansicht nach viele vielversprechende Möglichkeiten. Für Patienten bedeutet sie beispielsweise kürzere Wartezeiten, elektronische Gesundheitsakten und die Möglichkeit, Arzttermine bequem online zu buchen. Auch die Telemedizin ermöglicht es Menschen in ländlichen Gebieten, schneller ärztliche Hilfe zu erhalten.\n\nAllerdings sehe ich auch Risiken. Der Schutz sensibler Patientendaten muss gewährleistet sein, und nicht alle Menschen sind im Umgang mit digitalen Geräten versiert, was zu Ungleichheiten führen könnte.\n\nIch stelle mir vor, dass in Zukunft künstliche Intelligenz die Diagnostik unterstützen wird, wobei die persönliche Arzt-Patienten-Beziehung unverzichtbar bleiben sollte.',
        keyPhrases: ['meiner Ansicht nach', 'bietet viele Möglichkeiten', 'Allerdings sehe ich auch Risiken', 'Der Schutz', 'Ich stelle mir vor'],
        checklist: ['Einleitung mit Standpunkt', 'Vorteile für Patienten', 'Risiken benannt', 'Zukunftsvision', 'Mindestens 80 Wörter'],
      },
      {
        type: 'meinung',
        title: 'Fremdsprachen lernen',
        situation: 'Ihr Kursleiter bittet Sie, einen kurzen Text darüber zu schreiben, warum das Erlernen von Fremdsprachen wertvoll ist.',
        points: [
          'Welche Vorteile hat es, Fremdsprachen zu sprechen?',
          'Welche Sprache(n) lernen Sie und warum?',
          'Geben Sie Tipps, wie man am besten eine Sprache lernt',
        ],
        minWords: 80,
        sampleResponse: 'Das Erlernen von Fremdsprachen eröffnet Türen zu anderen Kulturen und erweitert den persönlichen Horizont. Wer mehrere Sprachen spricht, hat bessere berufliche Chancen und kann auf Reisen tiefere Verbindungen knüpfen.\n\nIch lerne gerade Deutsch, weil ich in Deutschland lebe und arbeite. Außerdem spreche ich Englisch und etwas Französisch. Jede Sprache hat mir neue Perspektiven geschenkt.\n\nMeiner Erfahrung nach lernt man am besten, wenn man die Sprache im Alltag anwendet. Ich empfehle, täglich mindestens eine halbe Stunde zu üben, deutsche Filme zu schauen und so oft wie möglich mit Muttersprachlern ins Gespräch zu kommen.',
        keyPhrases: ['eröffnet Türen', 'den Horizont erweitern', 'Meiner Erfahrung nach', 'Ich empfehle', 'ins Gespräch kommen'],
        checklist: ['Vorteile genannt', 'Persönliche Sprachen und Gründe', 'Lerntipps gegeben', 'Kohärente Struktur', 'Mindestens 80 Wörter'],
      },
      {
        type: 'meinung',
        title: 'Gesunde Ernährung',
        situation: 'Für die Schulzeitung schreiben Sie einen Beitrag zum Thema „Wie kann man sich im stressigen Alltag gesund ernähren?".',
        points: [
          'Warum ist gesunde Ernährung wichtig?',
          'Welche Schwierigkeiten gibt es im Alltag?',
          'Nennen Sie praktische Tipps für eine gesunde Ernährung',
        ],
        minWords: 80,
        sampleResponse: 'Eine ausgewogene Ernährung ist die Grundlage für ein gesundes und energiereiches Leben. Wer sich gut ernährt, ist leistungsfähiger, fühlt sich wohler und beugt vielen Krankheiten vor.\n\nIm stressigen Alltag ist es jedoch oft schwierig, sich gesund zu ernähren. Viele Menschen greifen aus Zeitmangel zu Fertiggerichten oder Fast Food, was langfristig der Gesundheit schadet.\n\nMeine praktischen Tipps wären: Am Wochenende für die ganze Woche vorkochen, immer frisches Obst dabei haben und ausreichend Wasser trinken. Außerdem hilft es, gemeinsam mit Freunden oder der Familie zu kochen, denn das macht nicht nur Spaß, sondern motiviert auch zu einer besseren Ernährung.',
        keyPhrases: ['die Grundlage für', 'Im stressigen Alltag', 'aus Zeitmangel', 'Meine praktischen Tipps', 'langfristig'],
        checklist: ['Bedeutung erklärt', 'Alltagsschwierigkeiten benannt', 'Praktische Tipps', 'Kohärente Struktur', 'Mindestens 80 Wörter'],
      },
    ],

    arztbrief: [
      {
        type: 'arztbrief',
        title: 'Patientin mit Rückenschmerzen',
        situation: 'Frau Müller, 45 Jahre, kommt mit chronischen Rückenschmerzen. Sie arbeitet im Büro und sitzt viel. Schmerzen seit 3 Monaten, verstärkt am Abend. Keine Ausstrahlung in die Beine.',
        patientInfo: {
          name: 'Ingrid Müller',
          age: 45,
          gender: 'weiblich',
          symptoms: 'chronische Rückenschmerzen seit 3 Monaten, verstärkt abends',
          history: 'Bürotätigkeit, wenig Bewegung, keine Vorerkrankungen',
          findings: 'Muskelverspannungen im Bereich der Lendenwirbelsäule, keine neurologischen Auffälligkeiten',
          diagnosis: 'Lumbago bei muskulärer Dysbalance',
          treatment: 'Physiotherapie 2x/Woche, Ibuprofen 400mg bei Bedarf, ergonomische Arbeitsplatzberatung',
        },
        minWords: 120,
        sampleResponse: 'Sehr geehrte Frau Kollegin, sehr geehrter Herr Kollege,\n\nwir berichten über unsere Patientin Frau Ingrid Müller, geb. am 12.05.1981, die sich am 10.03.2026 in unserer Praxis vorstellte.\n\nAnamnese:\nFrau Müller klagt seit drei Monaten über zunehmende Schmerzen im unteren Rückenbereich, die besonders am Abend stärker werden. Sie ist beruflich als Büroangestellte tätig und verbringt den Großteil des Tages im Sitzen. Eine Ausstrahlung in die unteren Extremitäten wird verneint.\n\nBefund:\nBei der klinischen Untersuchung zeigen sich ausgeprägte Muskelverspannungen im Bereich der Lendenwirbelsäule. Neurologische Auffälligkeiten konnten nicht festgestellt werden.\n\nDiagnose:\nLumbago bei muskulärer Dysbalance (M54.5)\n\nTherapie:\nWir haben Physiotherapie zweimal wöchentlich verordnet sowie Ibuprofen 400mg bei Bedarf empfohlen. Zusätzlich wurde eine ergonomische Arbeitsplatzberatung eingeleitet.\n\nProcedere:\nEine Wiedervorstellung ist in vier Wochen vorgesehen, um den Behandlungserfolg zu evaluieren.\n\nMit freundlichen kollegialen Grüßen',
        keyPhrases: ['Wir berichten über', 'stellte sich vor', 'Anamnese', 'Befund', 'Diagnose', 'Therapie', 'Procedere', 'kollegiale Grüße'],
        checklist: ['Formelle ärztliche Anrede', 'Einleitung mit Patientendaten', 'Anamnese vollständig', 'Befund beschrieben', 'Diagnose mit ICD-Bezug', 'Therapie erläutert', 'Procedere angegeben'],
      },
      {
        type: 'arztbrief',
        title: 'Patient mit Bluthochdruck',
        situation: 'Herr Schmidt, 58 Jahre, wird wegen Bluthochdruck behandelt. Erstdiagnose vor 2 Jahren. Bisherige Medikation reicht nicht aus. Neuer Therapieplan erforderlich.',
        patientInfo: {
          name: 'Klaus Schmidt',
          age: 58,
          gender: 'männlich',
          symptoms: 'Kopfschmerzen, Schwindel, erhöhte Blutdruckwerte (160/95 mmHg)',
          history: 'Arterielle Hypertonie seit 2 Jahren, bisher Ramipril 5mg, Übergewicht (BMI 29), Raucher',
          findings: 'RR 160/95 mmHg, leichte linksventrikuläre Hypertrophie im EKG, Labor: Cholesterin erhöht',
          diagnosis: 'Arterielle Hypertonie Grad II, unzureichend eingestellt',
          treatment: 'Ramipril 10mg, zusätzlich Amlodipin 5mg, Atorvastatin 20mg, Rauchstopp-Beratung, Gewichtsreduktion',
        },
        minWords: 120,
        sampleResponse: 'Sehr geehrte Frau Kollegin, sehr geehrter Herr Kollege,\n\nwir berichten über unseren Patienten Herrn Klaus Schmidt, geb. am 23.08.1968, der sich am 11.03.2026 zur Kontrolle in unserer Praxis vorstellte.\n\nAnamnese:\nBei Herrn Schmidt besteht seit zwei Jahren eine bekannte arterielle Hypertonie. Unter der bisherigen Monotherapie mit Ramipril 5mg zeigten sich weiterhin erhöhte Blutdruckwerte. Der Patient klagt über wiederkehrende Kopfschmerzen und gelegentlichen Schwindel.\n\nBefund:\nDer gemessene Blutdruck betrug 160/95 mmHg. Das EKG zeigte Hinweise auf eine leichte linksventrikuläre Hypertrophie. Die Laborwerte ergaben erhöhte Cholesterinwerte.\n\nDiagnose:\nArterielle Hypertonie Grad II (I11.9), unzureichend eingestellt. Hypercholesterinämie.\n\nTherapie:\nDie Ramipril-Dosis wurde auf 10mg erhöht und zusätzlich Amlodipin 5mg verordnet. Zur Senkung des Cholesterinspiegels wurde Atorvastatin 20mg angesetzt. Eine eingehende Beratung zum Rauchverzicht und zur Gewichtsreduktion wurde durchgeführt.\n\nProcedere:\nBlutdruckkontrolle in zwei Wochen, Laborkontrolle in sechs Wochen.\n\nMit freundlichen kollegialen Grüßen',
        keyPhrases: ['arterielle Hypertonie', 'Unter der bisherigen Therapie', 'Die Dosis wurde erhöht', 'zusätzlich verordnet', 'Beratung durchgeführt', 'Kontrolle in'],
        checklist: ['Formelle ärztliche Anrede', 'Einleitung mit Patientendaten', 'Anamnese vollständig', 'Befund beschrieben', 'Diagnose mit ICD-Bezug', 'Therapie erläutert', 'Procedere angegeben'],
      },
      {
        type: 'arztbrief',
        title: 'Kind mit Ohrenschmerzen',
        situation: 'Die Mutter bringt den 6-jährigen Tim, der seit 2 Tagen über Ohrenschmerzen klagt. Fieber von 38,5°C. Schnupfen seit einer Woche.',
        patientInfo: {
          name: 'Tim Becker',
          age: 6,
          gender: 'männlich',
          symptoms: 'Ohrenschmerzen links seit 2 Tagen, Fieber 38,5°C, Schnupfen seit 1 Woche',
          history: 'Keine relevanten Vorerkrankungen, Impfungen vollständig, letzter Infekt vor 3 Monaten',
          findings: 'Trommelfell links gerötet und vorgewölbt, Nasenatmung behindert, Rachenring leicht gerötet',
          diagnosis: 'Akute Otitis media links',
          treatment: 'Ibuprofen-Saft 100mg bei Schmerzen/Fieber, abschwellende Nasentropfen, Nachkontrolle in 48h, bei Verschlechterung Amoxicillin',
        },
        minWords: 120,
        sampleResponse: 'Sehr geehrte Frau Kollegin, sehr geehrter Herr Kollege,\n\nwir berichten über unseren kleinen Patienten Tim Becker, geb. am 15.07.2020, der am 12.03.2026 von seiner Mutter in unserer Praxis vorgestellt wurde.\n\nAnamnese:\nDer Junge klagt seit zwei Tagen über Schmerzen im linken Ohr. Seit einer Woche besteht ein Schnupfen. Heute wurde eine Körpertemperatur von 38,5°C gemessen. Vorerkrankungen sind nicht bekannt, die Impfungen sind vollständig.\n\nBefund:\nOtoskopisch zeigt sich das Trommelfell links gerötet und vorgewölbt. Die Nasenatmung ist behindert, der Rachenring leicht gerötet.\n\nDiagnose:\nAkute Otitis media links (H66.0)\n\nTherapie:\nZunächst symptomatische Behandlung mit Ibuprofen-Saft 100mg bei Schmerzen und Fieber. Abschwellende Nasentropfen zur Belüftung der Tube. Antibiotische Therapie mit Amoxicillin nur bei ausbleibender Besserung.\n\nProcedere:\nWiedervorstellung in 48 Stunden zur Verlaufskontrolle.\n\nMit freundlichen kollegialen Grüßen',
        keyPhrases: ['wurde vorgestellt', 'Otoskopisch', 'zunächst symptomatische Behandlung', 'bei ausbleibender Besserung', 'Wiedervorstellung', 'Verlaufskontrolle'],
        checklist: ['Formelle ärztliche Anrede', 'Einleitung mit Patientendaten', 'Anamnese vollständig', 'Befund beschrieben', 'Diagnose mit ICD-Bezug', 'Therapie erläutert', 'Procedere angegeben'],
      },
      {
        type: 'arztbrief',
        title: 'Patientin mit Diabetes-Erstdiagnose',
        situation: 'Frau Yilmaz, 52 Jahre, kommt mit Müdigkeit und häufigem Wasserlassen. Nüchternblutzucker 180 mg/dl. HbA1c 8,2%.',
        patientInfo: {
          name: 'Elif Yilmaz',
          age: 52,
          gender: 'weiblich',
          symptoms: 'anhaltende Müdigkeit, Polyurie, vermehrter Durst seit ca. 4 Wochen',
          history: 'Adipositas (BMI 32), positive Familienanamnese für Diabetes mellitus Typ 2',
          findings: 'Nüchternblutzucker 180 mg/dl, HbA1c 8,2%, Nierenwerte normwertig',
          diagnosis: 'Diabetes mellitus Typ 2, Erstmanifestation',
          treatment: 'Metformin 500mg 1-0-1, Ernährungsberatung, Diabetikerschulung, Bewegungstherapie',
        },
        minWords: 120,
        sampleResponse: 'Sehr geehrte Frau Kollegin, sehr geehrter Herr Kollege,\n\nwir berichten über unsere Patientin Frau Elif Yilmaz, geb. am 03.11.1974, die sich am 08.03.2026 erstmalig in unserer diabetologischen Sprechstunde vorstellte.\n\nAnamnese:\nFrau Yilmaz berichtet über anhaltende Müdigkeit, vermehrtes Wasserlassen und verstärkten Durst seit etwa vier Wochen. Familiär liegt eine Belastung für Diabetes mellitus Typ 2 vor. Die Patientin weist eine Adipositas mit einem BMI von 32 auf.\n\nBefund:\nDer Nüchternblutzucker betrug 180 mg/dl, der HbA1c-Wert lag bei 8,2%. Die Nierenfunktionsparameter zeigten sich im Normbereich.\n\nDiagnose:\nDiabetes mellitus Typ 2, Erstmanifestation (E11.9)\n\nTherapie:\nEingeleitet wurde eine Therapie mit Metformin 500mg zweimal täglich. Ferner wurden eine individuelle Ernährungsberatung, eine strukturierte Diabetikerschulung sowie eine Bewegungstherapie empfohlen.\n\nProcedere:\nKontrolle des HbA1c in drei Monaten. Augenärztliche Untersuchung und Fußstatus veranlasst.\n\nMit freundlichen kollegialen Grüßen',
        keyPhrases: ['Erstmanifestation', 'berichtet über', 'familiäre Belastung', 'Eingeleitet wurde', 'strukturierte Schulung', 'Kontrolle in drei Monaten'],
        checklist: ['Formelle ärztliche Anrede', 'Einleitung mit Patientendaten', 'Anamnese vollständig', 'Befund beschrieben', 'Diagnose mit ICD-Bezug', 'Therapie erläutert', 'Procedere angegeben'],
      },
      {
        type: 'arztbrief',
        title: 'Patient nach Fahrradsturz',
        situation: 'Herr Novak, 34 Jahre, nach Fahrradsturz. Schmerzen im rechten Handgelenk, Schwellung. Röntgen zeigt distale Radiusfraktur.',
        patientInfo: {
          name: 'Jan Novak',
          age: 34,
          gender: 'männlich',
          symptoms: 'Schmerzen und Schwellung rechtes Handgelenk nach Sturz vom Fahrrad',
          history: 'Sturz auf das ausgestreckte rechte Handgelenk, keine Vorerkrankungen',
          findings: 'Schwellung und Druckschmerz distaler Radius rechts, Bewegungseinschränkung, Röntgen: distale Radiusfraktur ohne Gelenkbeteiligung',
          diagnosis: 'Distale Radiusfraktur rechts, extraartikulär (Colles-Fraktur)',
          treatment: 'Geschlossene Reposition unter Lokalanästhesie, Gipsruhigstellung für 6 Wochen, Ibuprofen 600mg bei Bedarf',
        },
        minWords: 120,
        sampleResponse: 'Sehr geehrte Frau Kollegin, sehr geehrter Herr Kollege,\n\nwir berichten über unseren Patienten Herrn Jan Novak, geb. am 20.04.1992, der sich am 12.03.2026 nach einem Fahrradsturz in unserer chirurgischen Notaufnahme vorstellte.\n\nAnamnese:\nDer Patient ist beim Fahrradfahren gestürzt und dabei auf das ausgestreckte rechte Handgelenk gefallen. Er klagt über starke Schmerzen und eine zunehmende Schwellung. Relevante Vorerkrankungen bestehen nicht.\n\nBefund:\nKlinisch zeigt sich eine deutliche Schwellung und ein Druckschmerz über dem distalen Radius rechts. Die Beweglichkeit im Handgelenk ist schmerzhaft eingeschränkt. Die Durchblutung, Motorik und Sensibilität der Finger sind intakt. Röntgenologisch bestätigt sich eine distale Radiusfraktur ohne Gelenkbeteiligung.\n\nDiagnose:\nDistale Radiusfraktur rechts, extraartikulär (S52.5)\n\nTherapie:\nEs erfolgte eine geschlossene Reposition unter Lokalanästhesie mit anschließender Gipsruhigstellung. Schmerzmedikation mit Ibuprofen 600mg bei Bedarf.\n\nProcedere:\nRöntgenkontrolle nach einer Woche, Gipsabnahme nach sechs Wochen, anschließend Physiotherapie.\n\nMit freundlichen kollegialen Grüßen',
        keyPhrases: ['nach einem Sturz', 'chirurgische Notaufnahme', 'Durchblutung, Motorik und Sensibilität', 'Es erfolgte', 'Röntgenkontrolle', 'Gipsruhigstellung'],
        checklist: ['Formelle ärztliche Anrede', 'Einleitung mit Patientendaten', 'Anamnese vollständig', 'Befund beschrieben', 'Diagnose mit ICD-Bezug', 'Therapie erläutert', 'Procedere angegeben'],
      },
    ],
  };

  // ---------------------------------------------------------------------------
  // Arztbrief template reference
  // ---------------------------------------------------------------------------

  const arztbriefTemplate = `
    <div class="arztbrief-template">
      <h4>Aufbau eines Arztbriefes</h4>
      <ol>
        <li><strong>Anrede:</strong> Sehr geehrte Frau Kollegin, sehr geehrter Herr Kollege</li>
        <li><strong>Einleitung:</strong> Wir berichten über unsere(n) Patient(in) [Name], geb. am [Datum], der/die sich am [Datum] in unserer [Abteilung] vorstellte.</li>
        <li><strong>Anamnese:</strong> Beschwerden, Vorgeschichte, relevante Vorerkrankungen</li>
        <li><strong>Befund:</strong> Klinische Untersuchungsergebnisse, Labor, Bildgebung</li>
        <li><strong>Diagnose:</strong> Hauptdiagnose (möglichst mit ICD-Code), Nebendiagnosen</li>
        <li><strong>Therapie:</strong> Durchgeführte und verordnete Maßnahmen</li>
        <li><strong>Procedere:</strong> Weiteres Vorgehen, Kontrolltermine, Empfehlungen</li>
        <li><strong>Schluss:</strong> Mit freundlichen kollegialen Grüßen</li>
      </ol>
      <h4>Nützliche Formulierungen</h4>
      <ul>
        <li>„Der Patient / Die Patientin stellte sich erstmalig / erneut vor"</li>
        <li>„Es zeigten sich folgende Befunde"</li>
        <li>„Unter der eingeleiteten Therapie kam es zu einer Besserung"</li>
        <li>„Wir empfehlen eine Wiedervorstellung in [Zeitraum]"</li>
        <li>„Die Laborwerte ergaben / bestätigten"</li>
        <li>„Eingeleitet wurde eine Therapie mit"</li>
      </ul>
    </div>`;

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  function init(el, appData) {
    container = el;
    data = appData;
    _bindToolbar();
  }

  function render(_container, subRoute) {
    if (subRoute) {
      switch (subRoute) {
        case 'email': _startWriting('email'); return;
        case 'meinung': _startWriting('meinung'); return;
        case 'arztbrief': _startWriting('arztbrief'); return;
      }
    }
    _renderTypeSelector();
  }

  function destroy() {
    if (_toolbarHandler) {
      document.removeEventListener('click', _toolbarHandler);
      _toolbarHandler = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Toolbar
  // ---------------------------------------------------------------------------

  function _bindToolbar() {
    if (_toolbarHandler) document.removeEventListener('click', _toolbarHandler);
    _toolbarHandler = (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      switch (btn.getAttribute('data-action')) {
        case 'writing-new':
          _renderTypeSelector();
          break;
        case 'writing-tips':
          _showWritingTips();
          break;
      }
    };
    document.addEventListener('click', _toolbarHandler);
  }

  function _showWritingTips() {
    showModal('Tipps zum Schreiben', `
      <div class="writing-tips">
        <h4>Allgemeine Hinweise für das Goethe B1 Schreiben</h4>
        <ul>
          <li><strong>Aufgabe genau lesen:</strong> Bearbeiten Sie alle genannten Punkte vollständig.</li>
          <li><strong>Textlänge beachten:</strong> Mindestens 80 Wörter für E-Mails und Meinungstexte.</li>
          <li><strong>Angemessener Stil:</strong> Formell (Sie) bei offiziellen Schreiben, informell (du) bei Freunden.</li>
          <li><strong>Klare Gliederung:</strong> Einleitung, Hauptteil, Schluss.</li>
          <li><strong>Konnektoren verwenden:</strong> deshalb, außerdem, einerseits, andererseits, trotzdem.</li>
          <li><strong>Korrekturlesen:</strong> Prüfen Sie Groß- und Kleinschreibung, Kommasetzung und Verbstellung.</li>
        </ul>
      </div>`);
  }

  // ---------------------------------------------------------------------------
  // Type Selector
  // ---------------------------------------------------------------------------

  function _renderTypeSelector() {
    container.innerHTML = `
      <div class="writing-selector">
        <div class="writing-selector__intro">
          <p>Wählen Sie eine Aufgabenart, um Ihre schriftliche Ausdrucksfähigkeit zu trainieren. Jede Übung orientiert sich am Aufbau der Goethe B1 Prüfung.</p>
        </div>

        <div class="writing-selector__options">
          <div class="card card--hoverable writing-option" data-type="email">
            <div class="card__icon" aria-hidden="true">&#9993;</div>
            <h3 class="card__title">Persönliche E-Mail</h3>
            <p class="card__desc">Schreiben Sie eine E-Mail zu einer Alltagssituation und bearbeiten Sie drei vorgegebene Inhaltspunkte.</p>
            <span class="card__meta">${writingPrompts.email.length} Aufgaben</span>
          </div>

          <div class="card card--hoverable writing-option" data-type="meinung">
            <div class="card__icon" aria-hidden="true">&#128172;</div>
            <h3 class="card__title">Meinungsäußerung</h3>
            <p class="card__desc">Verfassen Sie einen Text, in dem Sie Ihre Meinung zu einem aktuellen Thema begründet darlegen.</p>
            <span class="card__meta">${writingPrompts.meinung.length} Aufgaben</span>
          </div>

          <div class="card card--hoverable writing-option" data-type="arztbrief">
            <div class="card__icon" aria-hidden="true">&#9764;</div>
            <h3 class="card__title">Arztbrief</h3>
            <p class="card__desc">Verfassen Sie einen medizinischen Arztbrief auf der Grundlage eines Patientenszenarios. Ideal für die Fachsprachenprüfung.</p>
            <span class="card__meta">${writingPrompts.arztbrief.length} Aufgaben</span>
          </div>
        </div>
      </div>`;

    container.querySelectorAll('.writing-option').forEach(card => {
      card.addEventListener('click', () => {
        const type = card.getAttribute('data-type');
        window.location.hash = '#writing/' + type;
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Writing exercise
  // ---------------------------------------------------------------------------

  function _startWriting(type) {
    currentType = type;
    const prompts = writingPrompts[type];
    if (!prompts || prompts.length === 0) {
      container.innerHTML = '<p class="text-muted">Keine Aufgaben für diesen Typ verfügbar.</p>';
      return;
    }

    const prompt = pickRandom(prompts, 1)[0];
    currentPrompt = prompt;

    const isArztbrief = type === 'arztbrief';

    let patientInfoHtml = '';
    if (isArztbrief && prompt.patientInfo) {
      const pi = prompt.patientInfo;
      patientInfoHtml = `
        <div class="writing-patient-info">
          <h4>Patienteninformationen</h4>
          <table class="table table--compact">
            <tr><td><strong>Name:</strong></td><td>${escapeHtml(pi.name)}</td></tr>
            <tr><td><strong>Alter:</strong></td><td>${pi.age} Jahre</td></tr>
            <tr><td><strong>Geschlecht:</strong></td><td>${escapeHtml(pi.gender)}</td></tr>
            <tr><td><strong>Symptome:</strong></td><td>${escapeHtml(pi.symptoms)}</td></tr>
            <tr><td><strong>Vorgeschichte:</strong></td><td>${escapeHtml(pi.history)}</td></tr>
            <tr><td><strong>Befund:</strong></td><td>${escapeHtml(pi.findings)}</td></tr>
            <tr><td><strong>Diagnose:</strong></td><td>${escapeHtml(pi.diagnosis)}</td></tr>
            <tr><td><strong>Therapie:</strong></td><td>${escapeHtml(pi.treatment)}</td></tr>
          </table>
        </div>`;
    }

    const pointsHtml = (prompt.points || []).map((p, i) =>
      `<li>${escapeHtml(p)}</li>`
    ).join('');

    container.innerHTML = `
      <div class="writing-exercise">
        <div class="writing-exercise__nav">
          <a href="#writing" class="btn btn--outline btn--sm">&larr; Zurück zur Auswahl</a>
          <span class="badge badge--info">${_getTypeLabel(type)}</span>
        </div>

        <div class="writing-exercise__prompt">
          <h3>${escapeHtml(prompt.title)}</h3>
          <p class="writing-exercise__situation">${escapeHtml(prompt.situation)}</p>
          ${pointsHtml ? `<div class="writing-exercise__points"><h4>Bearbeiten Sie folgende Punkte:</h4><ol>${pointsHtml}</ol></div>` : ''}
          ${patientInfoHtml}
          ${isArztbrief ? `<details class="writing-exercise__template"><summary class="btn btn--outline btn--sm">Vorlage und Formulierungshilfen anzeigen</summary>${arztbriefTemplate}</details>` : ''}
        </div>

        <div class="writing-exercise__editor">
          <textarea class="textarea writing-textarea" id="writing-text" rows="12"
            placeholder="${isArztbrief ? 'Sehr geehrte Frau Kollegin, sehr geehrter Herr Kollege,\n\nwir berichten über ...' : 'Schreiben Sie hier Ihren Text...'}"
            aria-label="Textfeld für Ihre Antwort"></textarea>
          <div class="writing-exercise__meta">
            <span class="writing-word-count" id="writing-word-count">0 Wörter</span>
            <span class="writing-min-words">Mindestens ${prompt.minWords} Wörter</span>
          </div>
        </div>

        <div class="writing-exercise__actions">
          <button class="btn btn--accent btn--lg" id="writing-submit">Abgeben und auswerten</button>
        </div>

        <div class="writing-exercise__results" id="writing-results" hidden></div>
      </div>`;

    _bindWritingEvents(prompt);
  }

  function _getTypeLabel(type) {
    switch (type) {
      case 'email': return 'Persönliche E-Mail';
      case 'meinung': return 'Meinungsäußerung';
      case 'arztbrief': return 'Arztbrief';
      default: return type;
    }
  }

  // ---------------------------------------------------------------------------
  // Event bindings
  // ---------------------------------------------------------------------------

  function _bindWritingEvents(prompt) {
    const textarea = container.querySelector('#writing-text');
    const wordCount = container.querySelector('#writing-word-count');
    const submitBtn = container.querySelector('#writing-submit');

    // Word counter
    if (textarea && wordCount) {
      textarea.addEventListener('input', () => {
        const count = _countWords(textarea.value);
        wordCount.textContent = count + ' ' + (count === 1 ? 'Wort' : 'Wörter');
        wordCount.classList.toggle('text-success', count >= prompt.minWords);
        wordCount.classList.toggle('text-warning', count > 0 && count < prompt.minWords);
      });
    }

    // Submit
    if (submitBtn) {
      submitBtn.addEventListener('click', () => _evaluateWriting(prompt));
    }
  }

  function _countWords(text) {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  }

  // ---------------------------------------------------------------------------
  // Writing evaluation
  // ---------------------------------------------------------------------------

  function _evaluateWriting(prompt) {
    const textarea = container.querySelector('#writing-text');
    const userText = textarea ? textarea.value.trim() : '';
    const wordCount = _countWords(userText);

    if (wordCount === 0) {
      showToast('Bitte schreiben Sie zunächst Ihren Text, bevor Sie die Auswertung starten.', 'warning');
      return;
    }

    // Build checklist evaluation
    const checklistResults = _evaluateChecklist(prompt, userText, wordCount);
    const passedItems = checklistResults.filter(c => c.passed).length;
    const totalItems = checklistResults.length;
    const percentage = Math.round((passedItems / totalItems) * 100);

    // Key phrases found
    const foundPhrases = (prompt.keyPhrases || []).filter(phrase =>
      userText.toLowerCase().includes(phrase.toLowerCase())
    );

    const resultsEl = container.querySelector('#writing-results');
    if (!resultsEl) return;

    resultsEl.innerHTML = `
      <div class="writing-results">
        <h3 class="writing-results__title">Auswertung Ihres Textes</h3>

        <div class="writing-results__checklist">
          <h4>Prüfliste</h4>
          <ul class="checklist">
            ${checklistResults.map(item => `
              <li class="checklist__item ${item.passed ? 'checklist__item--passed' : 'checklist__item--failed'}">
                <span class="checklist__icon">${item.passed ? '&#10003;' : '&#10007;'}</span>
                <span class="checklist__text">${escapeHtml(item.label)}</span>
              </li>`).join('')}
          </ul>
          <p class="writing-results__score">${passedItems} von ${totalItems} Kriterien erfüllt (${percentage}%)</p>
        </div>

        <div class="writing-results__phrases">
          <h4>Erkannte Schlüsselformulierungen</h4>
          ${foundPhrases.length > 0 ? `
            <div class="phrase-tags">
              ${foundPhrases.map(p => `<span class="badge badge--success">${escapeHtml(p)}</span>`).join(' ')}
            </div>` : '<p class="text-muted">Es wurden keine der empfohlenen Schlüsselformulierungen erkannt. Versuchen Sie, einige davon einzubauen.</p>'}
          ${(prompt.keyPhrases || []).length > foundPhrases.length ? `
            <details class="writing-results__more-phrases">
              <summary>Alle empfohlenen Formulierungen anzeigen</summary>
              <div class="phrase-tags">
                ${(prompt.keyPhrases || []).map(p => {
                  const found = foundPhrases.includes(p);
                  return `<span class="badge ${found ? 'badge--success' : 'badge--outline'}">${escapeHtml(p)}</span>`;
                }).join(' ')}
              </div>
            </details>` : ''}
        </div>

        <div class="writing-results__sample">
          <details>
            <summary class="btn btn--outline btn--sm">Musterantwort einblenden</summary>
            <div class="writing-sample">
              ${prompt.sampleResponse.split('\n').map(line =>
                line.trim() === '' ? '<br>' : `<p>${escapeHtml(line)}</p>`
              ).join('')}
            </div>
          </details>
        </div>

        <div class="writing-results__actions">
          <a href="#writing" class="btn btn--outline">Zur Auswahl</a>
          <button class="btn btn--accent" id="writing-retry">Neue Aufgabe (${_getTypeLabel(currentType)})</button>
        </div>
      </div>`;

    resultsEl.hidden = false;

    // Disable textarea and submit button
    if (textarea) textarea.disabled = true;
    const submitBtn = container.querySelector('#writing-submit');
    if (submitBtn) submitBtn.hidden = true;

    // Retry button
    const retryBtn = resultsEl.querySelector('#writing-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => _startWriting(currentType));
    }

    // Save progress
    _saveWritingProgress(percentage);

    // Scroll to results
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------------------------------------------------------------------------
  // Checklist evaluation
  // ---------------------------------------------------------------------------

  function _evaluateChecklist(prompt, text, wordCount) {
    const textLower = text.toLowerCase();

    if (prompt.type === 'arztbrief') {
      return _evaluateArztbriefChecklist(prompt, text, textLower, wordCount);
    }

    const results = [];
    const checklist = prompt.checklist || [];

    checklist.forEach(item => {
      const itemLower = item.toLowerCase();

      if (itemLower.includes('anrede')) {
        if (itemLower.includes('formell')) {
          results.push({
            label: item,
            passed: textLower.includes('sehr geehrte') || textLower.includes('sehr geehrter'),
          });
        } else if (itemLower.includes('persönlich')) {
          results.push({
            label: item,
            passed: textLower.includes('liebe') || textLower.includes('lieber') || textLower.includes('hallo'),
          });
        } else {
          results.push({
            label: item,
            passed: textLower.includes('sehr geehrte') || textLower.includes('liebe') || textLower.includes('hallo'),
          });
        }
      } else if (itemLower.includes('punkte bearbeitet') || itemLower.includes('alle drei')) {
        const pointsAddressed = (prompt.points || []).filter(point => {
          const keywords = point.toLowerCase().split(/\s+/).filter(w => w.length > 4);
          return keywords.some(kw => textLower.includes(kw));
        }).length;
        results.push({
          label: item,
          passed: pointsAddressed >= Math.ceil((prompt.points || []).length * 0.6),
        });
      } else if (itemLower.includes('schluss')) {
        results.push({
          label: item,
          passed: textLower.includes('grüße') || textLower.includes('gruß') || textLower.includes('mit freundlichen') || textLower.includes('herzliche') || textLower.includes('liebe grüße') || textLower.includes('viele grüße'),
        });
      } else if (itemLower.includes('wörter')) {
        const minMatch = item.match(/(\d+)/);
        const minWords = minMatch ? parseInt(minMatch[1], 10) : prompt.minWords;
        results.push({
          label: item,
          passed: wordCount >= minWords,
        });
      } else if (itemLower.includes('höflich')) {
        results.push({
          label: item,
          passed: textLower.includes('bitte') || textLower.includes('freundlich') || textLower.includes('dankbar') || textLower.includes('würde') || textLower.includes('könnten'),
        });
      } else if (itemLower.includes('ton') && itemLower.includes('freundlich')) {
        results.push({
          label: item,
          passed: textLower.includes('freue') || textLower.includes('herzlich') || textLower.includes('gerne') || textLower.includes('schön'),
        });
      } else if (itemLower.includes('einleitung')) {
        results.push({
          label: item,
          passed: textLower.includes('meiner meinung') || textLower.includes('ich bin der') || textLower.includes('ich denke') || textLower.includes('ich finde') || textLower.includes('grundlage') || textLower.includes('wichtig'),
        });
      } else if (itemLower.includes('persönlich') && (itemLower.includes('erfahrung') || itemLower.includes('beitrag'))) {
        results.push({
          label: item,
          passed: textLower.includes('ich persönlich') || textLower.includes('meiner erfahrung') || textLower.includes('ich selbst') || textLower.includes('bei mir'),
        });
      } else if (itemLower.includes('schlussfolgerung') || itemLower.includes('struktur') || itemLower.includes('kohärent')) {
        results.push({
          label: item,
          passed: wordCount >= (prompt.minWords * 0.8) && (textLower.includes('deshalb') || textLower.includes('daher') || textLower.includes('zusammenfassend') || textLower.includes('insgesamt') || text.split('\n').length > 2),
        });
      } else {
        // Generic: just check that the text is substantial
        const keywords = item.toLowerCase().split(/\s+/).filter(w => w.length > 4);
        const matched = keywords.some(kw => textLower.includes(kw));
        results.push({
          label: item,
          passed: matched || wordCount >= prompt.minWords,
        });
      }
    });

    return results;
  }

  function _evaluateArztbriefChecklist(prompt, text, textLower, wordCount) {
    return [
      {
        label: 'Formelle ärztliche Anrede',
        passed: textLower.includes('kollegin') || textLower.includes('kollege'),
      },
      {
        label: 'Einleitung mit Patientendaten',
        passed: textLower.includes('berichten über') || textLower.includes('vorstellte') || textLower.includes('patient'),
      },
      {
        label: 'Anamnese vollständig',
        passed: textLower.includes('anamnese') || textLower.includes('beschwerden') || textLower.includes('klagt') || textLower.includes('berichtet'),
      },
      {
        label: 'Befund beschrieben',
        passed: textLower.includes('befund') || textLower.includes('untersuchung') || textLower.includes('zeigt sich') || textLower.includes('zeigte'),
      },
      {
        label: 'Diagnose angegeben',
        passed: textLower.includes('diagnose') || (prompt.patientInfo && textLower.includes(prompt.patientInfo.diagnosis.toLowerCase().substring(0, 10))),
      },
      {
        label: 'Therapie erläutert',
        passed: textLower.includes('therapie') || textLower.includes('behandlung') || textLower.includes('verordnet') || textLower.includes('empfohlen'),
      },
      {
        label: 'Procedere angegeben',
        passed: textLower.includes('procedere') || textLower.includes('wiedervorstellung') || textLower.includes('kontrolle') || textLower.includes('weiteres vorgehen'),
      },
      {
        label: `Mindestens ${prompt.minWords} Wörter`,
        passed: wordCount >= prompt.minWords,
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Progress saving
  // ---------------------------------------------------------------------------

  function _saveWritingProgress(percentage) {
    const history = Storage.get('writing_history', []);
    history.push({
      type: currentType,
      title: currentPrompt ? currentPrompt.title : '',
      percentage,
      timestamp: new Date().toISOString(),
    });
    Storage.set('writing_history', history);

    const totalExercises = history.length;
    const avgScore = Math.round(
      history.reduce((sum, h) => sum + h.percentage, 0) / totalExercises
    );

    Storage.saveProgress('writing', {
      completed: totalExercises,
      total: totalExercises,
      score: avgScore,
    });

    App.recordPractice();
  }

  // ---------------------------------------------------------------------------
  // Public API (for exam module)
  // ---------------------------------------------------------------------------

  function getRandomPrompt(type) {
    const prompts = writingPrompts[type || 'email'];
    if (!prompts || prompts.length === 0) return null;
    return pickRandom(prompts, 1)[0];
  }

  function evaluateTextForExam(prompt, userText) {
    const wordCount = _countWords(userText);
    const checklistResults = _evaluateChecklist(prompt, userText, wordCount);
    const passedItems = checklistResults.filter(c => c.passed).length;
    return {
      checklist: checklistResults,
      passed: passedItems,
      total: checklistResults.length,
      percentage: Math.round((passedItems / checklistResults.length) * 100),
      wordCount,
    };
  }

  // ---------------------------------------------------------------------------
  // Module interface
  // ---------------------------------------------------------------------------

  return {
    init,
    render,
    destroy,
    getRandomPrompt,
    evaluateTextForExam,
  };

})();

App.registerModule('writing', WritingModule);
