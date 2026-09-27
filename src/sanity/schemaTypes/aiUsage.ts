import { SparklesIcon } from '@sanity/icons/Sparkles'
import { defineField, defineType } from 'sanity'

// Journal de consommation IA (B5) : un document PRIVÉ par demande (id « aiUsage.<id> », le point le
// rend illisible sans jeton), écrit par le moteur (engine/). Contrat : AiUsageDoc
// (src/admin/core/contracts/engine.ts). Absent de la structure du Studio et du menu « + ».
export const aiUsage = defineType({
  name: 'aiUsage',
  title: 'Consommation IA',
  type: 'document',
  icon: SparklesIcon,
  readOnly: true,
  fields: [
    defineField({
      name: 'feature',
      type: 'string',
      options: { list: ['editor', 'ask'] },
      validation: (rule) => rule.required(),
    }),
    defineField({ name: 'requestId', type: 'string', validation: (rule) => rule.required() }),
    defineField({ name: 'status', type: 'string', validation: (rule) => rule.required() }),
    defineField({ name: 'page', type: 'string' }),
    defineField({
      name: 'user',
      type: 'object',
      validation: (rule) => rule.required(),
      fields: [
        defineField({ name: 'id', type: 'string', validation: (rule) => rule.required() }),
        defineField({ name: 'name', type: 'string', validation: (rule) => rule.required() }),
        defineField({
          name: 'role',
          type: 'string',
          options: { list: ['kuartz', 'client', 'editor'] },
          validation: (rule) => rule.required(),
        }),
      ],
    }),
    defineField({ name: 'createdAt', type: 'datetime', validation: (rule) => rule.required() }),
    // Usage (contrat) : modèle, jetons, coût, durée.
    defineField({ name: 'model', type: 'string', validation: (rule) => rule.required() }),
    defineField({ name: 'inputTokens', type: 'number', validation: (rule) => rule.required() }),
    defineField({ name: 'outputTokens', type: 'number', validation: (rule) => rule.required() }),
    defineField({ name: 'cacheReadTokens', type: 'number', validation: (rule) => rule.required() }),
    defineField({ name: 'cacheWriteTokens', type: 'number', validation: (rule) => rule.required() }),
    defineField({ name: 'costUsd', type: 'number', validation: (rule) => rule.required() }),
    defineField({
      name: 'costKind',
      type: 'string',
      options: { list: ['billed', 'estimated'] },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'access',
      type: 'string',
      options: { list: ['api-key', 'subscription', 'none'] },
      validation: (rule) => rule.required(),
    }),
    defineField({ name: 'durationMs', type: 'number', validation: (rule) => rule.required() }),
    defineField({ name: 'turns', type: 'number' }),
  ],
  preview: {
    select: { feature: 'feature', model: 'model', createdAt: 'createdAt', cost: 'costUsd' },
    prepare: ({ feature, model, createdAt, cost }) => ({
      title: `${feature} · ${model}`,
      subtitle: `${createdAt ?? ''} · $${typeof cost === 'number' ? cost.toFixed(3) : '?'}`,
    }),
  },
})
