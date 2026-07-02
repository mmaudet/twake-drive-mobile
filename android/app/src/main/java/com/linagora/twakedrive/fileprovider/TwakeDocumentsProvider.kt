package com.linagora.twakedrive.fileprovider

import android.database.Cursor
import android.database.MatrixCursor
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.provider.DocumentsProvider

class TwakeDocumentsProvider : DocumentsProvider() {

    private lateinit var session: SessionStore
    private lateinit var api: CozyStackApi

    override fun onCreate(): Boolean {
        val ctx = context ?: return false
        session = SessionStore(EncryptedCredentialStore(ctx), okhttp3.OkHttpClient())
        api = CozyStackApi(session)
        return true
    }

    override fun queryRoots(projection: Array<out String>?): Cursor {
        val cursor = MatrixCursor(projection ?: DocumentMapper.DEFAULT_ROOT_PROJECTION)
        val uri = session.baseUri() ?: return cursor // no session → hide root
        if (session.creds() == null) return cursor
        val domain = uri.substringAfter("://").substringBefore('/')
        DocumentMapper.addRootRow(cursor, domain)
        return cursor
    }

    override fun queryDocument(documentId: String?, projection: Array<out String>?): Cursor {
        val cursor = MatrixCursor(projection ?: DocumentMapper.DEFAULT_DOCUMENT_PROJECTION)
        val id = documentId ?: return cursor
        DocumentMapper.addFileRow(cursor, api.get(id))
        return cursor
    }

    override fun queryChildDocuments(
        parentDocumentId: String?,
        projection: Array<out String>?,
        sortOrder: String?
    ): Cursor {
        val cursor = MatrixCursor(projection ?: DocumentMapper.DEFAULT_DOCUMENT_PROJECTION)
        val parent = parentDocumentId ?: return cursor
        for (f in api.list(parent)) DocumentMapper.addFileRow(cursor, f)
        // Register for change notifications so notifyChange() after a mutation
        // refreshes this listing in the picker.
        context?.let {
            cursor.setNotificationUri(
                it.contentResolver,
                android.provider.DocumentsContract.buildChildDocumentsUri(
                    DocumentMapper.AUTHORITY, parent)
            )
        }
        return cursor
    }

    override fun openDocument(
        documentId: String?,
        mode: String?,
        signal: CancellationSignal?
    ): ParcelFileDescriptor = throw UnsupportedOperationException("Task 7")
}
