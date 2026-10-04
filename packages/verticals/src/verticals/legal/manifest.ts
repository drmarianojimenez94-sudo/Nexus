import { defineVertical } from "../../manifest";

/**
 * Nexus Abogacía — generado por la fábrica de verticales (estado draft).
 * Completar: marco legal (legal.recordFields), señales de alarma,
 * vocabulario (domainTerms ≥ 10), plantillas y ≥ casos de referencia del
 * perfil. Ver docs/NEXUS_VERTICAL_FACTORY.md y `pnpm --filter @nexus/verticals score legal`.
 */
export const legalVertical = defineVertical({
  "id": "legal",
  "name": "Nexus Abogacía",
  "profession": "Abogado/a",
  "version": "0.1.0",
  "profile": "generic",
  "locale": "es-AR",
  "timezone": "America/Argentina/Buenos_Aires",
  "status": "draft",
  "vocabulary": {
    "subject": {
      "singular": "cliente",
      "plural": "clientes"
    },
    "record": {
      "singular": "consulta",
      "plural": "consultas"
    },
    "followup": {
      "singular": "pendiente",
      "plural": "pendientes"
    },
    "appointment": {
      "singular": "reunión",
      "plural": "reuniones"
    },
    "professional": "Abogado/a",
    "domainTerms": []
  },
  "standard": {
    "name": "Modelo interno NEXUS (sin estándar sectorial definido)",
    "url": "https://github.com/drmarianojimenez94-sudo/Nexus"
  },
  "entities": [
    {
      "id": "subject",
      "label": "cliente",
      "standardResource": "Person",
      "sensitive": true,
      "identifier": "document",
      "storage": "clinical_patients (almacén cifrado de personas)",
      "fields": [
        {
          "key": "name",
          "label": "Nombre",
          "required": true
        },
        {
          "key": "document",
          "label": "Documento / CUIT"
        },
        {
          "key": "phone",
          "label": "Teléfono"
        }
      ]
    },
    {
      "id": "record",
      "label": "consulta",
      "standardResource": "Record",
      "sensitive": true,
      "storage": "clinical_encounters (borrador → validado)",
      "fields": [
        {
          "key": "occurredAt",
          "label": "Fecha",
          "required": true
        },
        {
          "key": "fields",
          "label": "Contenido según plantilla",
          "required": true
        }
      ]
    },
    {
      "id": "followup",
      "label": "Pendiente",
      "standardResource": "Task",
      "sensitive": true,
      "storage": "clinical_followups",
      "fields": [
        {
          "key": "title",
          "label": "Qué hay que hacer",
          "required": true
        },
        {
          "key": "dueAt",
          "label": "Vencimiento",
          "required": true
        }
      ]
    },
    {
      "id": "appointment",
      "label": "Reunión",
      "standardResource": "Appointment",
      "sensitive": false,
      "storage": "events",
      "fields": [
        {
          "key": "startAt",
          "label": "Inicio",
          "required": true
        }
      ]
    }
  ],
  "relationships": [
    {
      "from": "record",
      "to": "subject",
      "kind": "belongsTo"
    },
    {
      "from": "followup",
      "to": "subject",
      "kind": "belongsTo"
    },
    {
      "from": "appointment",
      "to": "subject",
      "kind": "references"
    }
  ],
  "templates": [
    {
      "id": "legal:note",
      "name": "Nota de consulta",
      "structure": "Libre estructurada",
      "sections": [
        {
          "key": "reason",
          "label": "Motivo"
        },
        {
          "key": "notes",
          "label": "Desarrollo"
        },
        {
          "key": "plan",
          "label": "Próximos pasos"
        }
      ]
    }
  ],
  "workflows": [
    {
      "id": "day-agenda",
      "name": "Mi día",
      "states": [
        "planned",
        "closed"
      ],
      "initial": "planned",
      "final": [
        "closed"
      ],
      "transitions": [
        {
          "from": "planned",
          "to": "closed",
          "trigger": "Cierre de jornada",
          "requiresHuman": true
        }
      ]
    },
    {
      "id": "followups",
      "name": "Pendientes",
      "states": [
        "pending",
        "done"
      ],
      "initial": "pending",
      "final": [
        "done"
      ],
      "createsFollowups": true,
      "transitions": [
        {
          "from": "pending",
          "to": "done",
          "trigger": "Pendiente resuelto",
          "requiresHuman": true
        }
      ]
    }
  ],
  "legal": {
    "jurisdiction": "AR",
    "frameworks": [
      {
        "id": "ley25326",
        "name": "Ley 25.326 — Protección de datos personales",
        "url": "https://servicios.infoleg.gob.ar/infolegInternet/anexos/60000-64999/64790/norma.htm"
      }
    ],
    "recordFields": [
      {
        "ref": "todo.identificacion",
        "description": "Completar con los asientos exigidos por la profesión",
        "coveredBy": [
          "subject.name"
        ]
      }
    ],
    "retention": {
      "years": 5,
      "from": "last_activity"
    },
    "appendOnlyAfterSignature": true,
    "amendmentsAsNewEntries": true,
    "audit": {
      "reads": true,
      "writes": true,
      "actor": true
    },
    "coding": [],
    "authorship": {
      "author": true,
      "specialty": false,
      "timestamp": true,
      "signedAt": true
    },
    "chronological": true,
    "sequenced": false
  },
  "consent": {
    "recording": {
      "required": true,
      "recordedBy": "human",
      "beforeCapture": true,
      "statement": "El profesional confirma el consentimiento antes de dictar con la persona presente."
    },
    "revocable": true
  },
  "ai": {
    "sensitiveToExternalAI": false,
    "sensitiveRouting": "redirect_to_vertical",
    "humanReviewRequired": true,
    "generatedFields": [
      {
        "field": "record.fields",
        "source": "rules",
        "requiresHumanReview": true,
        "initialStatus": "draft"
      }
    ],
    "provisionalCategories": [],
    "provenance": true,
    "evidenceLinking": true,
    "forbiddenActions": [
      {
        "id": "finalize_without_review",
        "description": "Validar un registro sin revisión humana"
      },
      {
        "id": "external_send_without_confirmation",
        "description": "Enviar datos a terceros sin confirmación"
      }
    ]
  },
  "safety": {
    "redFlags": [],
    "negationCues": [
      "no",
      "sin",
      "niega"
    ],
    "medicationCatalog": [],
    "allergyCrossCheck": false,
    "doseVerification": false
  },
  "capabilities": [
    {
      "id": "microphone",
      "purpose": "Dictar",
      "ios": {
        "infoPlistKeys": [
          "NSMicrophoneUsageDescription"
        ]
      },
      "android": {
        "permissions": [
          "android.permission.RECORD_AUDIO"
        ]
      },
      "expoPlugin": {
        "name": "expo-speech-recognition",
        "option": "microphonePermission"
      },
      "rationale": "Nexus usa el micrófono solo mientras tocás Dictar, para transcribir tus notas. No graba en segundo plano.",
      "fallback": "Escribir con el teclado.",
      "status": "planned"
    },
    {
      "id": "speechRecognition",
      "purpose": "Transcribir",
      "ios": {
        "infoPlistKeys": [
          "NSSpeechRecognitionUsageDescription"
        ]
      },
      "android": {
        "permissions": []
      },
      "expoPlugin": {
        "name": "expo-speech-recognition",
        "option": "speechRecognitionPermission"
      },
      "rationale": "El reconocimiento de voz convierte tu dictado en texto para preparar borradores que revisás antes de guardar.",
      "fallback": "Escribir la nota.",
      "status": "planned"
    },
    {
      "id": "contacts",
      "purpose": "Completar teléfonos",
      "ios": {
        "infoPlistKeys": [
          "NSContactsUsageDescription"
        ]
      },
      "android": {
        "permissions": [
          "android.permission.READ_CONTACTS"
        ]
      },
      "expoPlugin": {
        "name": "expo-contacts",
        "option": "contactsPermission"
      },
      "rationale": "Nexus abre tus contactos solo cuando elegís uno, para completar un teléfono. No sube tu agenda.",
      "fallback": "Escribir el teléfono.",
      "status": "planned",
      "prefersSystemPicker": true
    },
    {
      "id": "calendar",
      "purpose": "Agenda del teléfono",
      "ios": {
        "infoPlistKeys": [
          "NSCalendarsFullAccessUsageDescription"
        ]
      },
      "android": {
        "permissions": [
          "android.permission.READ_CALENDAR",
          "android.permission.WRITE_CALENDAR"
        ]
      },
      "expoPlugin": {
        "name": "expo-calendar",
        "option": "calendarPermission"
      },
      "rationale": "Con tu permiso, Nexus copia tus reuniones al calendario del teléfono sin datos confidenciales.",
      "fallback": "Ver la agenda dentro de Nexus.",
      "status": "planned"
    }
  ],
  "privacy": {
    "sensitiveData": true,
    "encryptionAtRest": "AES-256-GCM por registro",
    "encryptionInTransit": "TLS",
    "audioRetention": "not_stored",
    "appointmentTitles": "initials",
    "noAdvertising": true,
    "noTrainingWithoutConsent": true,
    "noCloudBackupOfSensitiveData": true,
    "accountDeletion": false,
    "dataSubjectRights": [
      "access",
      "rectification"
    ],
    "localDeviceProtection": "Sin datos de personas guardados en el teléfono"
  },
  "store": {
    "category": "Productivity",
    "disclaimer": "Nexus organiza la práctica profesional; las decisiones son del profesional.",
    "privacyPolicyPath": "docs/NEXUS_PRIVACY_POLICY.md",
    "appleHealthDataRules": false,
    "playHealthDeclaration": false,
    "dataSafetyDeclared": false
  },
  "evaluation": {
    "referenceNow": "2026-10-05T12:00:00.000Z",
    "goldenCases": [
      {
        "id": "subject-and-followup",
        "utterance": "Cliente Ana Gómez, motivo revisión anual. Llamarla el viernes.",
        "expect": {
          "subjectName": "Ana Gomez",
          "followups": [
            {
              "kind": "CALL",
              "inDays": 4
            }
          ]
        }
      }
    ],
    "errorTaxonomy": [
      {
        "id": "fabrication",
        "label": "Invención",
        "severity": "major"
      },
      {
        "id": "omission",
        "label": "Omisión",
        "severity": "major"
      },
      {
        "id": "negation",
        "label": "Negación invertida",
        "severity": "major"
      },
      {
        "id": "attribution",
        "label": "Atribución errónea",
        "severity": "major"
      }
    ],
    "releaseThreshold": {
      "maxMajorErrors": 0,
      "minPassRate": 0.9
    }
  },
  "intents": [
    {
      "id": "capture_record",
      "step": "record",
      "permissionLevel": 4,
      "patterns": [
        "\\bcliente\\b"
      ],
      "example": "Cliente Ana Gómez, motivo…"
    }
  ],
  "capture": {
    "subjectCues": [
      "cliente"
    ],
    "newSubjectCues": [
      "\\bcliente nuev[oa]\\b"
    ],
    "documentCue": {
      "label": "Documento",
      "pattern": "\\b(?:dni|documento|cuit)\\s*:?\\s*(\\d{1,2}[.-]?\\d{3}[.-]?\\d{3}(?:[.-]?\\d)?)\\b"
    },
    "defaultTemplate": "legal:note",
    "newSubjectTemplate": "legal:note",
    "templateRules": [],
    "sectionCues": [
      {
        "id": "reason",
        "targets": [
          "reason"
        ],
        "patterns": [
          "\\bmotivo:?"
        ]
      },
      {
        "id": "plan",
        "targets": [
          "plan"
        ],
        "patterns": [
          "\\bproximos pasos:?",
          "\\bhay que\\b"
        ]
      }
    ],
    "measurements": [],
    "followupTargets": [
      "plan"
    ],
    "fallbackTargets": [
      "notes"
    ],
    "nameStopWords": [
      "de",
      "del",
      "con",
      "por",
      "que",
      "motivo",
      "y",
      "para",
      "en",
      "la",
      "el"
    ],
    "followupRules": [
      {
        "kind": "CALL",
        "title": "Llamar",
        "patterns": [
          "\\bllamar(?:lo|la|le)?\\b"
        ]
      },
      {
        "kind": "RESULT",
        "title": "Revisar documentación",
        "patterns": [
          "\\bdocumentacion\\b",
          "\\bpresentar\\b"
        ]
      },
      {
        "kind": "CONTROL",
        "title": "Revisión",
        "patterns": [
          "\\brevisar en\\b",
          "\\bvolver a ver\\b"
        ]
      }
    ],
    "appointmentCues": [
      "\\breunion\\b",
      "\\bagend"
    ]
  },
  "suggestions": [
    {
      "id": "overdue-followups",
      "description": "Pendientes vencidos"
    },
    {
      "id": "calls-today",
      "description": "Llamadas del día"
    },
    {
      "id": "stale-drafts",
      "description": "Borradores sin validar"
    },
    {
      "id": "free-slot",
      "description": "Huecos de agenda"
    },
    {
      "id": "empty-day",
      "description": "Día libre"
    },
    {
      "id": "next-appointment",
      "description": "Próxima reunión"
    }
  ],
  "routes": {
    "home": "/v/legal/day",
    "subjects": "/v/legal",
    "subject": "/v/legal/:id",
    "followups": "/v/legal/pendientes",
    "capture": "/v/legal/capture",
    "calendar": "/calendar"
  }
});
