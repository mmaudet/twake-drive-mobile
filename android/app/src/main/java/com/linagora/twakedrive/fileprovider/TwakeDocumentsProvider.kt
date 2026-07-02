package com.linagora.twakedrive.fileprovider

import android.database.Cursor
import android.database.MatrixCursor
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.provider.DocumentsProvider

/**
 * SAF entry point. Stub in Task 1 — real behaviour lands in Tasks 6–11.
 */
class TwakeDocumentsProvider : DocumentsProvider() {

    override fun onCreate(): Boolean = true

    override fun queryRoots(projection: Array<out String>?): Cursor =
        MatrixCursor(projection ?: DocumentMapper.DEFAULT_ROOT_PROJECTION)

    override fun queryDocument(documentId: String?, projection: Array<out String>?): Cursor =
        MatrixCursor(projection ?: DocumentMapper.DEFAULT_DOCUMENT_PROJECTION)

    override fun queryChildDocuments(
        parentDocumentId: String?,
        projection: Array<out String>?,
        sortOrder: String?
    ): Cursor = MatrixCursor(projection ?: DocumentMapper.DEFAULT_DOCUMENT_PROJECTION)

    override fun openDocument(
        documentId: String?,
        mode: String?,
        signal: CancellationSignal?
    ): ParcelFileDescriptor = throw UnsupportedOperationException("Not implemented yet")
}
