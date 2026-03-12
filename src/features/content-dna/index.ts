// Content DNA feature module — barrel export
export { useContentDNAProfiles, useContentDNAProfile, useCreateContentDNA, useUpdateContentDNA, useDeleteContentDNA, useAssignBrandToDNA, useUnassignBrandFromDNA, useContentDNATemplates, useCreateDNAFromTemplate, CONTENT_DNA_KEY } from './hooks/use-content-dna'
export type { ContentDNAProfile, ContentDNACreate, ContentDNAUpdate, ContentDNATemplate } from './types'
export { getDNAStrength } from './types'
