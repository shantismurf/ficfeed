import { db } from './utilities.js';

export async function createTable(tableName, columns) {
    const createTableQuery = `CREATE TABLE IF NOT EXISTS ${tableName} (${columns})`;
    await db.query(createTableQuery);
}

await createTable('tracker', `
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    work_id VARCHAR(32) NOT NULL,
    status ENUM('to read', 'reading', 'finished') DEFAULT 'to read',
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    work_title VARCHAR(255),
    author_name VARCHAR(255),
    last_chapter_read INT DEFAULT 0,
    notes TEXT
`);

await createTable('series', `
    id INT AUTO_INCREMENT PRIMARY KEY,
    series_id VARCHAR(255) NOT NULL,
    series_title VARCHAR(255) NOT NULL
`);

await createTable('collections', `
    id INT AUTO_INCREMENT PRIMARY KEY,
    collection_name VARCHAR(255) NOT NULL,
    collection_title VARCHAR(255) NOT NULL
`);

await createTable('work_series', `
    work_id VARCHAR(255) NOT NULL,
    series_id VARCHAR(255) NOT NULL,
    PRIMARY KEY (work_id, series_id)
`);

await createTable('work_collection', `
    work_id VARCHAR(255) NOT NULL,
    collection_id VARCHAR(255) NOT NULL,
    PRIMARY KEY (work_id, collection_id)
`);

// Add AO3 link to user's list
export async function trackAo3Link(userId, workUrl, status = 'to read', workTitle = '', authorName = '') {
    await db.execute(
        `INSERT INTO tracker (user_id, work_url, status, work_title, author_name)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, workUrl, status, workTitle, authorName]
    );
}

// List all tracked links for a user
export async function listAo3Links(userId, { search, status, startDate, endDate } = {}) {
    let query = `SELECT work_url, status, work_title, author_name, last_chapter_read, notes, date_added
                 FROM tracker WHERE user_id = ?`;
    const params = [userId];

    if (search) {
        query += ` AND (work_title LIKE ? OR author_name LIKE ? OR notes LIKE ? OR tags LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
        query += ` AND status = ?`;
        params.push(status);
    }
    if (startDate) {
        query += ` AND (date_added >= ? OR (status = 'finished' AND date_updated >= ?))`;
        params.push(startDate, startDate);
    }
    if (endDate) {
        query += ` AND (date_added <= ? OR (status = 'finished' AND date_updated <= ?))`;
        params.push(endDate, endDate);
    }
    query += ` ORDER BY date_added DESC`;

    const [rows] = await db.execute(query, params);
    return rows;
}

// Update status, last chapter, or notes
export async function updateAo3Link(userId, workUrl, { status, lastChapterRead, notes }) {
    await db.execute(
        `UPDATE tracker SET
            status = COALESCE(?, status),
            last_chapter_read = COALESCE(?, last_chapter_read),
            notes = COALESCE(?, notes)
         WHERE user_id = ? AND work_url = ?`,
        [status, lastChapterRead, notes, userId, workUrl]
    );
}

// Remove a link from user's list
export async function untrackAo3Link(userId, workUrl) {
    await db.execute(
        `DELETE FROM tracker WHERE user_id = ? AND work_url = ?`,
        [userId, workUrl]
    );
}