export const EDIR_APPLICATION_DOCUMENTS = Object.freeze([
  Object.freeze({ type: 'legal_registration', label: 'Official legal registration certificate' }),
  Object.freeze({ type: 'governance_charter', label: 'Governance or bylaws document' }),
]);

export function signupRequiredDocuments(signupOptions, accountType) {
  const requirements = signupOptions?.kyc_requirements;
  if (!requirements || !Object.hasOwn(requirements, accountType) || !Array.isArray(requirements[accountType])) {
    return null;
  }
  return [...new Set(requirements[accountType])];
}

export function missingSignupDocuments(requiredDocuments, fileForDocument) {
  if (!Array.isArray(requiredDocuments)) return null;
  return requiredDocuments.filter((documentType) => !fileForDocument(documentType));
}

export function canChangeServer(role) {
  return role === 'super_admin';
}

export function edirApplicationDocumentPath(applicationId, documentType) {
  return `/edir/public/registration-applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentType)}`;
}
