package com.linagora.twakedrive.fileprovider

import android.database.MatrixCursor
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

    fun mimeOf(f: CozyFile): String =
        if (f.isDir) Document.MIME_TYPE_DIR else (f.mime ?: "application/octet-stream")

    fun flagsFor(f: CozyFile): Int {
        var flags = Document.FLAG_SUPPORTS_DELETE or
            Document.FLAG_SUPPORTS_RENAME or
            Document.FLAG_SUPPORTS_MOVE or
            Document.FLAG_SUPPORTS_REMOVE
        if (f.isDir) {
            flags = flags or Document.FLAG_DIR_SUPPORTS_CREATE
        } else {
            flags = flags or Document.FLAG_SUPPORTS_WRITE
            if (f.hasThumbnail()) flags = flags or Document.FLAG_SUPPORTS_THUMBNAIL
        }
        return flags
    }

    fun addFileRow(cursor: MatrixCursor, f: CozyFile) {
        cursor.newRow()
            .add(Document.COLUMN_DOCUMENT_ID, f.id)
            .add(Document.COLUMN_DISPLAY_NAME, f.name)
            .add(Document.COLUMN_MIME_TYPE, mimeOf(f))
            .add(Document.COLUMN_FLAGS, flagsFor(f))
            .add(Document.COLUMN_SIZE, f.size)
            .add(Document.COLUMN_LAST_MODIFIED, if (f.updatedAt > 0) f.updatedAt else null)
    }

    fun addRootRow(cursor: MatrixCursor, domain: String) {
        cursor.newRow()
            .add(Root.COLUMN_ROOT_ID, ROOT_ID)
            .add(Root.COLUMN_DOCUMENT_ID, ROOT_DOC_ID)
            .add(Root.COLUMN_TITLE, "Twake Drive")
            .add(Root.COLUMN_SUMMARY, domain)
            .add(Root.COLUMN_FLAGS, Root.FLAG_SUPPORTS_CREATE or Root.FLAG_SUPPORTS_IS_CHILD)
            .add(Root.COLUMN_ICON, com.linagora.twakedrive.R.mipmap.ic_launcher)
    }
}
