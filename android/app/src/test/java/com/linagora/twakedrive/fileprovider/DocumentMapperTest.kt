package com.linagora.twakedrive.fileprovider

import android.database.MatrixCursor
import android.provider.DocumentsContract.Document
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DocumentMapperTest {

    private fun file(isDir: Boolean, klass: String? = null, mime: String? = null) =
        CozyFile("id1", "n", isDir, "p", 42L, mime, klass, 1000L, if (isDir) "/n" else null)

    @Test fun `directory mime is the SAF dir type`() {
        assertEquals(Document.MIME_TYPE_DIR, DocumentMapper.mimeOf(file(isDir = true)))
    }

    @Test fun `file mime falls back to octet-stream`() {
        assertEquals("application/octet-stream", DocumentMapper.mimeOf(file(isDir = false)))
        assertEquals("text/plain", DocumentMapper.mimeOf(file(isDir = false, mime = "text/plain")))
    }

    @Test fun `file flags allow write rename move delete`() {
        val flags = DocumentMapper.flagsFor(file(isDir = false))
        assertTrue(flags and Document.FLAG_SUPPORTS_WRITE != 0)
        assertTrue(flags and Document.FLAG_SUPPORTS_RENAME != 0)
        assertTrue(flags and Document.FLAG_SUPPORTS_MOVE != 0)
        assertTrue(flags and Document.FLAG_SUPPORTS_DELETE != 0)
    }

    @Test fun `image files advertise a thumbnail`() {
        val flags = DocumentMapper.flagsFor(file(isDir = false, klass = "image"))
        assertTrue(flags and Document.FLAG_SUPPORTS_THUMBNAIL != 0)
    }

    @Test fun `directory advertises create but not write`() {
        val flags = DocumentMapper.flagsFor(file(isDir = true))
        assertTrue(flags and Document.FLAG_DIR_SUPPORTS_CREATE != 0)
        assertEquals(0, flags and Document.FLAG_SUPPORTS_WRITE)
    }

    @Test fun `addFileRow fills the document id and name`() {
        val c = MatrixCursor(DocumentMapper.DEFAULT_DOCUMENT_PROJECTION)
        DocumentMapper.addFileRow(c, file(isDir = false, mime = "text/plain"))
        c.moveToFirst()
        assertEquals("id1", c.getString(c.getColumnIndex(Document.COLUMN_DOCUMENT_ID)))
        assertEquals("n", c.getString(c.getColumnIndex(Document.COLUMN_DISPLAY_NAME)))
    }
}
