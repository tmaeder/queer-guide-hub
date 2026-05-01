/**
 * Content Type Registry — split into per-type files under ./contentTypes/.
 * This shim preserves existing import paths. Migrate consumers to
 * `@/config/contentTypes` directly in a follow-up PR, then delete this file.
 */
export {
  contentTypeRegistry,
  getContentTypeIds,
  getContentType,
  getFieldsByGroup,
  getFieldGroups,
  fieldGroupLabels,
} from './contentTypes';
