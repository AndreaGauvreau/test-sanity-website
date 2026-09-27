'use server'

import { deleteAssetsCore, listImagesCore, updateAltTextCore, type ActionResult, type PickerImage } from './actions-core'
import { mediaDeps } from './deps'

/**
 * Server actions de la médiathèque (C5). Minces : droit, zod et garde de suppression dans actions-core.ts.
 * L'envoi de fichiers passe par la route `/admin/media/upload` (corps binaire, sans la limite de 1 Mo des actions).
 */

export async function updateAltTextAction(input: { assetId: string; altText: string }): Promise<ActionResult<{ altText: string }>> {
  return updateAltTextCore(mediaDeps(), input)
}

export async function deleteAssetsAction(input: { ids: string[] }): Promise<ActionResult<{ deleted: string[]; locked: string[] }>> {
  return deleteAssetsCore(mediaDeps(), input)
}

export async function listImagesAction(): Promise<ActionResult<{ images: PickerImage[] }>> {
  return listImagesCore(mediaDeps())
}
