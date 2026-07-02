package com.linagora.twakedrive.fileprovider

import android.provider.DocumentsContract.Document
import android.provider.DocumentsContract.Root

object DocumentMapper {
    const val AUTHORITY = "com.linagora.twakedrive.documents"
    const val ROOT_ID = "twake"
    const val ROOT_DOC_ID = "io.cozy.files.root-dir"
    val HIDDEN_IDS = setOf("io.cozy.files.trash-dir", "io.cozy.files.shared-drives-dir")

    val DEFAULT_ROOT_PROJECTION = arrayOf(
        Root.COLUMN_ROOT_ID, Root.COLUMN_FLAGS, Root.COLUMN_TITLE,
        Root.COLUMN_DOCUMENT_ID, Root.COLUMN_ICON, Root.COLUMN_SUMMARY
    )
    val DEFAULT_DOCUMENT_PROJECTION = arrayOf(
        Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE,
        Document.COLUMN_FLAGS, Document.COLUMN_SIZE, Document.COLUMN_LAST_MODIFIED
    )
}
