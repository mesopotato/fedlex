const mysql = require('mysql');
require('dotenv').config(); // Load environment variables from .env file

class Database {
    constructor() {
        this.connection = mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        this.connect();
    }

    connect() {
        this.connection.connect(err => {
            if (err) {
                console.error('Error connecting to the database: ' + err.stack);
                return;
            }
            console.log('Connected to database with thread ID: ', this.connection.threadId);
        });
    }

    createTables() {
        const createLawTextTable = `
            CREATE TABLE IF NOT EXISTS lawText (
                id INT AUTO_INCREMENT PRIMARY KEY,
                insert_tsd TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                srn VARCHAR(35),
                title TEXT,
                preface TEXT,
                preamble TEXT,
                status VARCHAR(255),
                shortName VARCHAR(35),
                beschlussDate VARCHAR(35),
                inkrafttretenDate VARCHAR(35),
                quelleName VARCHAR(35),
                chronologieLink VARCHAR(255),
                changesLink VARCHAR(255), 
                sourceLink VARCHAR(255),  
                quelleLink VARCHAR(255)
            )`;

        const createArticlesTable = `
            CREATE TABLE IF NOT EXISTS articles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                insert_tsd TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                srn VARCHAR(35),
                shortName VARCHAR(35),
                book_id VARCHAR(35),
                book_name TEXT,
                part_id VARCHAR(35),
                part_name TEXT,
                title_id VARCHAR(35),
                title_name TEXT,
                sub_title_id VARCHAR(35),
                sub_title_name TEXT,
                chapter_id VARCHAR(35),
                chapter_name TEXT,
                sub_chapter_id VARCHAR(35),
                sub_chapter_name TEXT,
                section_id VARCHAR(35),
                section_name TEXT,
                sub_section_id VARCHAR(35),
                sub_section_name TEXT,
                article_id VARCHAR(255),
                article_name TEXT,
                reference TEXT,
                ziffer_id VARCHAR(35),                
                ziffer_name TEXT,
                absatz VARCHAR(255),
                text_w_footnotes MEDIUMTEXT
            )`;

        this.connection.query(createLawTextTable, (err, results, fields) => {
            if (err) throw err;
            console.log('LawText table created or already exists.');
        });

        this.connection.query(createArticlesTable, (err, results, fields) => {
            if (err) throw err;
            console.log('Articles table created or already exists.');
        });
    }

    dropTable(tableName) {
        const query = `DROP TABLE IF EXISTS ${mysql.escapeId(tableName)};`;
        this.connection.query(query, (err, results) => {
            if (err) {
                console.error(`Error dropping ${tableName} table: ` + err);
                return;
            }
            console.log(`${tableName} table dropped.`);
        });
    }

    insertOrUpdateLawText(data) {
        const defaults = {
            srn: '', 
            title: '', 
            preface: '', 
            preamble: '', 
            status: '',
            shortName: '', 
            beschlussDate: '', 
            inkrafttretenDate: '',
            quelleName: '',
            chronologieLink: '',
            changesLink: '',
            sourceLink: '',
            quelleLink: ''
        };
    
        // Fill in defaults where necessary
        const completeData = { ...defaults, ...data };
    
        return new Promise((resolve, reject) => {
            // First, check if an entry exists with the same srn
            const selectQuery = `SELECT * FROM lawText WHERE srn = ?`;
            this.connection.query(selectQuery, [completeData.srn], (selectErr, selectResults) => {
                if (selectErr) {
                    console.error('Error checking for existing lawText:', selectErr);
                    this.insertError(completeData.srn, selectErr);
                    reject(selectErr);
                    return;
                }
    
                if (selectResults.length > 0) {
                    // Entry exists, compare and decide whether to update
                    const existingData = selectResults[0];
                    let needsUpdate = false;
                    let updateSet = [];
    
                    // Prepare an update query if necessary
                    for (let key in completeData) {
                        if (completeData[key] !== existingData[key] && completeData[key] !== '' && completeData[key] != null) {
                            needsUpdate = true;
                            updateSet.push(`${key} = ${mysql.escape(completeData[key])}`);
                        }
                    }
    
                    if (needsUpdate) {
                        this.archiveLawText(existingData);
                        const updateQuery = `UPDATE lawText SET ${updateSet.join(', ')} WHERE srn = ${mysql.escape(completeData.srn)}`;
                        this.connection.query(updateQuery, (updateErr, updateResults) => {
                            if (updateErr) {
                                console.error('Error updating lawText:', updateErr);
                                this.insertError(completeData.srn, updateErr);
                                reject(updateErr);
                            } else {
                                console.log(`LawText updated : ${existingData.title}`);
                                resolve(updateResults);
                            }
                        });
                    } else {
                        console.log('No update needed');
                        resolve({ message: 'No update needed', ...existingData });
                    }
                } else {
                    // No existing entry, insert new
                    const insertQuery = `INSERT INTO lawText (srn, title, preface, preamble, status, shortName, beschlussDate, inkrafttretenDate, quelleName, chronologieLink, changesLink, sourceLink, quelleLink) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                    this.connection.query(insertQuery, Object.values(completeData), (insertErr, insertResults) => {
                        if (insertErr) {
                            console.error('Error inserting new lawText:', insertErr);
                            this.insertError(completeData.srn, insertErr);
                            reject(insertErr);
                        } else {
                            console.log(`LawText inserted : ${completeData.title} ID: ${insertResults.insertId}`);
                            resolve(insertResults);
                        }
                    });
                }
            });
        });
    }

    insertOrUpdateArticle(data) {
        const defaults = {
            srn: '',
            shortName: '',
            book_id: '',
            book_name: '',
            part_id: '',
            part_name: '',
            title_id: '',
            title_name: '',
            sub_title_id: '',
            sub_title_name: '',
            chapter_id: '',
            chapter_name: '',
            sub_chapter_id: '',
            sub_chapter_name: '',
            section_id: '',
            section_name: '',
            sub_section_id: '',
            sub_section_name: '',
            article_id: '',
            article_name: '',
            reference: '',
            ziffer_id: '',
            ziffer_name: '',
            absatz: '',
            text_w_footnotes: ''
        };
    
        const completeData = { ...defaults, ...data };
    
        return new Promise((resolve, reject) => {
            // Construct the query to check for existing records
            /* book_id: '',
            book_name: '',
            part_id: '',
            part_name: '',
            title_id: '',
            title_name: '',
            sub_title_id: '',
            sub_title_name: '',
            chapter_id: '',
            chapter_name: '',
            sub_chapter_id: '',
            sub_chapter_name: '',
            section_id: '',
            section_name: '',
            sub_section_id: '',
            sub_section_name: '',
            article_id: '',
            article_name: '',
            reference: '',
            ziffer_id: '',
            ziffer_name: '',
            absatz: '', */
            const checkQuery = `SELECT * FROM articles WHERE srn = ? AND book_id = ? AND book_name = ? AND part_id = ? AND part_name = ? AND title_id = ? AND title_name = ? AND sub_title_id = ? AND sub_title_name = ? AND chapter_id = ? AND chapter_name = ? AND sub_chapter_id = ? AND sub_chapter_name = ? AND section_id = ? AND section_name = ? AND sub_section_id = ? AND sub_section_name = ? AND article_id = ? AND article_name = ? AND reference = ? AND ziffer_id = ? AND ziffer_name = ? AND absatz = ?`;
            this.connection.query(checkQuery, [completeData.srn, completeData.book_id, completeData.book_name, completeData.part_id, completeData.part_name, completeData.title_id, completeData.title_name, completeData.sub_title_id, completeData.sub_title_name, completeData.chapter_id, completeData.chapter_name, completeData.sub_chapter_id, completeData.sub_chapter_name, completeData.section_id, completeData.section_name, completeData.sub_section_id, completeData.sub_section_name, completeData.article_id, completeData.article_name, completeData.reference, completeData.ziffer_id, completeData.ziffer_name, completeData.absatz], (checkErr, checkResults) => {
                if (checkErr) {
                    console.error('Error checking for existing article:', checkErr);
                    this.insertError(completeData.srn, checkErr);
                    reject(checkErr);
                    return;
                }
                if (checkResults.length > 0) {
                    // Entry exists, compare and decide whether to update
                    const existingData = checkResults[0];
                    let needsUpdate = false;
                    let updateSet = [];
    
                    // Prepare an update query if necessary
                    for (let key in completeData) {
                        if (completeData[key] !== existingData[key] && completeData[key] !== '' && completeData[key] != null) {
                            needsUpdate = true;
                            updateSet.push(`${key} = ${mysql.escape(completeData[key])}`);
                        }
                    }
    
                    if (needsUpdate) {

                        this.archiveArticle(existingData);

                        const updateQuery = `UPDATE articles SET ${updateSet.join(', ')} WHERE srn = ${mysql.escape(completeData.srn)} AND book_id = ${mysql.escape(completeData.book_id)} AND book_name = ${mysql.escape(completeData.book_name)} AND part_id = ${mysql.escape(completeData.part_id)} AND part_name = ${mysql.escape(completeData.part_name)} AND title_id = ${mysql.escape(completeData.title_id)} AND title_name = ${mysql.escape(completeData.title_name)} AND sub_title_id = ${mysql.escape(completeData.sub_title_id)} AND sub_title_name = ${mysql.escape(completeData.sub_title_name)} AND chapter_id = ${mysql.escape(completeData.chapter_id)} AND chapter_name = ${mysql.escape(completeData.chapter_name)} AND sub_chapter_id = ${mysql.escape(completeData.sub_chapter_id)} AND sub_chapter_name = ${mysql.escape(completeData.sub_chapter_name)} AND section_id = ${mysql.escape(completeData.section_id)} AND section_name = ${mysql.escape(completeData.section_name)} AND sub_section_id = ${mysql.escape(completeData.sub_section_id)} AND sub_section_name = ${mysql.escape(completeData.sub_section_name)} AND article_id = ${mysql.escape(completeData.article_id)} AND article_name = ${mysql.escape(completeData.article_name)} AND reference = ${mysql.escape(completeData.reference)} AND ziffer_id = ${mysql.escape(completeData.ziffer_id)} AND ziffer_name = ${mysql.escape(completeData.ziffer_name)} AND absatz = ${mysql.escape(completeData.absatz)}`; 
                        this.connection.query(updateQuery, (updateErr, updateResults) => {
                            if (updateErr) {
                                console.error('Error updating article:', updateErr);
                                this.insertError(completeData.srn, updateErr);
                                reject(updateErr);
                                return;
                            }
                            console.log(`Article updated for SRN: ${completeData.srn}, Article ID: ${completeData.article_id}`);
                            resolve({ message: 'Article updated', details: updateResults });
                        });
                    } else {
                        console.log('No update needed for SRN:', completeData.srn, 'Article ID:', completeData.article_id, 'Absatz:', completeData.absatz, 'Ziffer:', completeData.ziffer_id, 'Chapter:', completeData.chapter_id, 'Section:', completeData.section_id, 'Title:', completeData.title_id);
                        resolve({ message: 'No update needed', details: existingData });
                    }
                } else {
                    // No existing entry, insert new
                    const insertQuery = `INSERT INTO articles (srn, shortName, book_id, book_name, part_id, part_name, title_id, title_name, sub_title_id, sub_title_name, chapter_id, chapter_name, sub_chapter_id, sub_chapter_name, section_id, section_name, sub_section_id, sub_section_name, article_id, article_name, reference, ziffer_id, ziffer_name, absatz, text_w_footnotes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`; 
                    this.connection.query(insertQuery, Object.values(completeData), (insertErr, insertResults) => {
                        if (insertErr) {
                            console.error('Error inserting new article:', insertErr);
                            this.insertError(completeData.srn, insertErr);
                            reject(insertErr);
                        } else {
                            //console.log(`Article inserted for SRN: ${completeData.srn}`);
                            resolve(insertResults);
                        }
                    });
                }
            });
        });
    }

    createHistoryTables() {
        const createLawTextHistoryTable = `
            CREATE TABLE IF NOT EXISTS lawText_history (
                id INT,
                insert_tsd TIMESTAMP,
                srn VARCHAR(35),
                title TEXT,
                preface TEXT,
                preamble TEXT,
                status VARCHAR(255),
                shortName VARCHAR(35),
                beschlussDate VARCHAR(35),
                inkrafttretenDate VARCHAR(35),
                quelleName VARCHAR(35),
                chronologieLink VARCHAR(255),
                changesLink VARCHAR(255), 
                sourceLink VARCHAR(255),  
                quelleLink VARCHAR(255),
                archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`;
    
        const createArticlesHistoryTable = `
            CREATE TABLE IF NOT EXISTS articles_history (
                id INT,
                insert_tsd TIMESTAMP,
                srn VARCHAR(35),
                shortName VARCHAR(35),
                book_id VARCHAR(35),
                book_name TEXT,
                part_id VARCHAR(35),
                part_name TEXT,
                title_id VARCHAR(35),
                title_name TEXT,
                sub_title_id VARCHAR(35),
                sub_title_name TEXT,
                chapter_id VARCHAR(35),
                chapter_name TEXT,
                sub_chapter_id VARCHAR(35),
                sub_chapter_name TEXT,
                section_id VARCHAR(35),
                section_name TEXT,
                sub_section_id VARCHAR(35),
                sub_section_name TEXT,
                article_id VARCHAR(255),
                article_name TEXT,
                reference TEXT,
                ziffer_id VARCHAR(35),                
                ziffer_name TEXT,
                absatz VARCHAR(255),
                text_w_footnotes MEDIUMTEXT,
                archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`;
    
        this.connection.query(createLawTextHistoryTable, (err, results, fields) => {
            if (err) throw err;
            console.log('LawText_history table created or already exists.');
        });
    
        this.connection.query(createArticlesHistoryTable, (err, results, fields) => {
            if (err) throw err;
            console.log('Articles_history table created or already exists.');
        });
    }

    archiveArticle(articleData) {
        return new Promise((resolve, reject) => {
            const archiveQuery = `INSERT INTO articles_history (id, insert_tsd, srn, shortName, book_id, book_name, part_id, part_name, title_id, title_name, sub_title_id, sub_title_name, chapter_id, chapter_name, sub_chapter_id, sub_chapter_name, section_id, section_name, sub_section_id, sub_section_name, article_id, article_name, reference, ziffer_id, ziffer_name, absatz, text_w_footnotes, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`; 
    
            // Prepare the data array to match the order and structure of the fields in the archiveQuery
            this.connection.query(archiveQuery, [
                articleData.id,
                articleData.insert_tsd,
                articleData.srn,
                articleData.shortName,
                articleData.book_id,
                articleData.book_name,
                articleData.part_id,
                articleData.part_name,
                articleData.title_id,
                articleData.title_name,
                articleData.sub_title_id,
                articleData.sub_title_name,
                articleData.chapter_id,
                articleData.chapter_name,
                articleData.sub_chapter_id,
                articleData.sub_chapter_name,
                articleData.section_id,
                articleData.section_name,
                articleData.sub_section_id,
                articleData.sub_section_name,
                articleData.article_id,
                articleData.article_name,
                articleData.reference,
                articleData.ziffer_id,
                articleData.ziffer_name,
                articleData.absatz,
                articleData.text_w_footnotes
            ], (err, results) => {
                if (err) {
                    console.error('Error archiving article:', err);
                    reject(err);
                } else {
                    console.log(`Article archived with ID: ${results.insertId}`);
                    resolve(results);
                }
            });
        });
    }

    archiveLawText(lawTextData) {
        return new Promise((resolve, reject) => {
            const archiveQuery = `INSERT INTO lawText_history (id, insert_tsd, srn, title, preface, preamble, status, shortName, beschlussDate, inkrafttretenDate, quelleName, chronologieLink, changesLink, sourceLink, quelleLink, archived_at) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
    
            // The data array should match the order of fields in the archiveQuery
            this.connection.query(archiveQuery, [
                lawTextData.id,
                lawTextData.insert_tsd,
                lawTextData.srn,
                lawTextData.title,
                lawTextData.preface,
                lawTextData.preamble,
                lawTextData.status,
                lawTextData.shortName,
                lawTextData.beschlussDate,
                lawTextData.inkrafttretenDate,
                lawTextData.quelleName,
                lawTextData.chronologieLink,
                lawTextData.changesLink,
                lawTextData.sourceLink,
                lawTextData.quelleLink
            ], (err, results) => {
                if (err) {
                    console.error('Error archiving law text:', err);
                    reject(err);
                } else {
                    console.log(`Law text archived with ID: ${results.insertId}`);
                    resolve(results);
                }
            });
        });
    }

    createErrorTable() {
        const createErrorTableSQL = `
            CREATE TABLE IF NOT EXISTS errorLog (
                id INT AUTO_INCREMENT PRIMARY KEY,
                insert_tsd TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                srn VARCHAR(35),
                error_text MEDIUMTEXT
            )`;
    
        this.connection.query(createErrorTableSQL, (err, results, fields) => {
            if (err) {
                console.error('Error creating errorLog table:', err);
                return;
            }
            console.log('ErrorLog table created or already exists.');
        });
    }

    insertError(srn, errorText) {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO errorLog (srn, error_text) VALUES (?, ?)`;
            const errorTextAsString = errorText instanceof Error ? errorText.stack : String(errorText);
            this.connection.query(query, [srn, errorTextAsString], (err, results) => {
                if (err) {
                    console.error('Error inserting into errorLog:', err);
                    reject(err);
                } else {
                    console.log(`Error logged with ID: ${results.insertId}`);
                    resolve(results);
                }
            });
        });
    }

    close() {
        return new Promise((resolve, reject) => {
            this.pool.end(err => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    query(sql, args) {
        return new Promise((resolve, reject) => {
            this.pool.query(sql, args, (err, results) => {
                if (err) return reject(err);
                resolve(results);
            });
        });
    }
}

module.exports = Database;
