/** The per-file limit used by the page picker, Rivto file input and workspace HTTP service. */
const maxAttachmentMiB=16
export const maxAttachmentBytes=maxAttachmentMiB*1024*1024
export const attachmentSizeError='Each attachment must be '+maxAttachmentMiB+' MiB or smaller.'
