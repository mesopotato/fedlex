const puppeteer = require('puppeteer');
const Database = require('./db');

async function scrapeWebsite() {
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        // Enable request interception to block ad-related requests
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if(req.resourceType() === 'image' || req.url().includes('ads')) {
                req.abort();
            } else {
                req.continue();
            }
        });    

        // Function to close pop-ups by targeting the 'dismiss-button' id
        async function closePopUps(page) {
            if (!page) {
                console.log('Page object is undefined in closePopUps function.');
                return; // Exit the function if page is not defined
            }
        
            try {
                const closeButtonSelector = '#dismiss-button'; // Using id selector for simplicity and reliability
                const closeButton = await page.$(closeButtonSelector);
                if (closeButton) {
                    await page.click(closeButtonSelector);
                    console.log('Pop-up closed');
                } else {
                    console.log('No pop-up found to close.');
                }
            } catch (error) {
                console.error('Error in closePopUps:', error.message);
            }
        }

        await page.goto('https://www.gesetze.ch/', {waitUntil: 'networkidle0', timeout: 120000});

        // Close any pop-up that might be open when the page loads
        await closePopUps(page);    

        // Get all the links within the div with class 'list-group list-group-light'
        const links = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('.list-group.list-group-light a'));
            return anchors.map(anchor => anchor.href);
        });

        // Visit each link
        for (const link of links) {
            console.log(`Going to ${link}`);
            const subPage = await browser.newPage();

            // Repeat request interception and pop-up closing for the new page
            await subPage.setRequestInterception(true);
            subPage.on('request', (req) => {
                if(req.resourceType() === 'image' || req.url().includes('ads')) {
                    req.abort();
                } else {
                    req.continue();
                }
            });        

            await subPage.goto(link, {waitUntil: 'networkidle0', timeout: 120000});
            await closePopUps(subPage); 

            // Extract links that start with a two-digit number
            const specificLinks = await subPage.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('.list-group.list-group-light a'));
                return anchors.reduce((acc, anchor) => {
                    // Check if the text starts with two digits
                    if (/^\d{2}\s/.test(anchor.textContent.trim())) {
                        acc.push({ href: anchor.href, text: anchor.textContent.trim() });
                    }
                    if (/^0.\d{2}\s/.test(anchor.textContent.trim())) {
                        acc.push({ href: anchor.href, text: anchor.textContent.trim() });
                    }
                    return acc;
                }, []);
            });

            // Print out the href and text for each link that matches the criteria
            specificLinks.forEach(({ href, text }) => {
                console.log(`Link: ${href}, Text: ${text}`);
            });

            // For each specific link, navigate and interact within the "fedlex" page
            for (const { href } of specificLinks) {
                await navigateAndProcessFedlexPage(page, href);
            }        

            // Close the subpage after you are done with it
            await subPage.close();
        }
    } catch (error) {
        console.error('Error in scrapeWebsite:', error.message);
    } finally {
        if (browser) {
            await page.close();
            await browser.close();
        }
        await db.close();
    }

}
async function navigateAndProcessFedlexPage(page, url) {
    await page.goto(url , {waitUntil: 'networkidle0', timeout: 120000});

    console.log(`navigated to URL: ${url}`);
    // Wait for the content to load, adjust the selector as needed
    await page.waitForSelector('#content');
    console.log('Content loaded');

    // Extract and navigate each link within the #content div
    const linksInContent = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('#content .table.text-left.table-striped a'));
        return links
            .map(link => link.href)
            .filter(href => !href.includes('#')); // Filter out links that are just anchors
    });

    console.log(`Found ${linksInContent.length} links in content for URL: ${url}`);
    // Example to log out each found link, or further navigate to it as needed
    for (const link of linksInContent) {
        console.log(link);
        await navigateToLawText(page, link);
    };
}

async function navigateToLawText(page, url) {
    try {
        
        await page.goto(url, {waitUntil: 'networkidle0', timeout: 120000});
        await page.waitForSelector('#preface'); // Ensure the 'preface' div is fully loaded

        // Extract static data with corrected selectors
        const srn = await page.$eval('#preface .srnummer', el => el.textContent.trim());
        const title = await page.$eval('#preface h1', el => {
            // Replace <br> tags with a space
            el.querySelectorAll('br').forEach(br => br.replaceWith(' '));
            // Return the modified text content, trimming to remove extra spaces
            return el.textContent.trim();
        });
        const preface = await page.evaluate(() => {
            // Function to process footnotes and replace <a> tags with footnote text
            const processFootnotes = (textElement) => {
                const anchors = textElement.querySelectorAll('sup a');
                for (const anchor of anchors) {
                    const fragment = anchor.getAttribute('href').split('#')[1];
                    if (fragment) {
                        const footnoteElement = document.querySelector(`div.footnotes *[id="${fragment}"]`);
                        if (footnoteElement) {
                            const footnoteText = ` footnote{${footnoteElement.textContent.trim()}}`;
                            anchor.outerHTML = footnoteText; // Replace the <a> element with the footnote text
                        }
                    }
                }
            };
        
            // Extract the text content of the element with id 'preface' except the h1 element and the tag with class 'srnummer'
            const element = document.querySelector('#preface');
        
            if (element) {
                element.querySelectorAll('br').forEach(br => br.replaceWith(' ')); // Replace <br> tags with spaces
                const h1Element = element.querySelector('h1');
                if (h1Element) {
                    h1Element.remove(); // Remove the h1 element from the parent element
                }
                const srnummerElement = element.querySelector('.srnummer');
                if (srnummerElement) {
                    srnummerElement.remove(); // Remove the srnummer element from the parent element
                }
        
                // Process footnotes in the element
                processFootnotes(element);
        
                // Return the processed text content
                return element.textContent.trim();
            }
        
            return " "; // Return a single space if the element doesn't exist or no text is found
        });
        const preamble = await page.$eval('#preamble', (el) => {
            // Define a function to process footnotes within the text element
            const processFootnotes = (textElement) => {
                const anchors = textElement.querySelectorAll('sup a');
                for (const anchor of anchors) {
                    const fragment = anchor.getAttribute('href').split('#')[1];
                    if (fragment) {
                        const footnoteElement = document.querySelector(`div.footnotes *[id="${fragment}"]`);
                        if (footnoteElement) {
                            const footnoteText = ` footnote{${footnoteElement.textContent.trim()}}`;
                            anchor.outerHTML = footnoteText; // Replace the <a> element with the footnote text
                        }
                    }
                }
                return textElement.textContent.trim();
            };
        
            // Process footnotes and return the modified text
            return processFootnotes(el);
        });
        const status = await page.evaluate(() => {
            const inForceStatus = document.querySelector('#sidebar app-in-force-status');
            return inForceStatus ? inForceStatus.textContent.trim() : "Status unbekannt";
        });

        // Dynamically extract data from #annexeContent
        const annexeContentData = await page.evaluate(() => {
            const dataMap = {
                'Abkürzung': 'shortName',
                'Beschluss': 'beschlussDate',
                'Inkrafttreten': 'inkrafttretenDate',
                'Quelle': 'quelleName',
                'Chronologie': 'chronologieLink',
                'Änderungen': 'changesLink',
            };

            const data = {};
            document.querySelectorAll('#annexeContent > div').forEach(div => {
                const keyText = div.querySelector('strong')?.textContent.trim();
                const value = div.querySelector('p a')?.href || div.querySelector('p')?.textContent.trim();
                
                if (keyText && dataMap[keyText]) {
                    data[dataMap[keyText]] = value;
                }
            });
            return data;
        });

        const adjustedURL = url.replace(/(eli\/)cc\//, '$1oc/');

        // Construct the complete lawTextData object
        const lawTextData = {
            srn,
            title,
            preface,
            preamble,
            status,
            ...annexeContentData, // Spread the dynamically extracted data into the lawTextData object
            sourceLink : url,
            quelleLink : adjustedURL    
        };

        //console.log(lawTextData);
        // Insert the law text data into the database
        await db.insertOrUpdateLawText(lawTextData);

        try {
            const articlesData = await extractArticles(page, lawTextData.srn, lawTextData.shortName);
           // console.log(articlesData);
           console.log(`Extracted ${articlesData.length} articles for SRN: ${lawTextData.srn}`);
           for (const data of articlesData) {
                await db.insertOrUpdateArticle(data);
            //console.log(data);
            }
        } catch (error) {
            console.error('Error extracting articles:', error);
        }     

    } catch (error) {
        console.error('Error navigating to or processing law text:', error.message);
       
    }
}

async function extractArticles(page, srn, shortName) {
    // Extract and insert articles into the database
    const articlesData = await page.evaluate((srn, shortName) => {
        // Extract and insert articles into the database
        let articles = [];

        articles = Array.from(document.querySelectorAll('article'));
        const results = [];

        //console.log('articles', articles);

        articles.forEach(article => {
            let book_id = '', book_name = '';
            let part_id = '', part_name = '';
            let title_id = '', title_name = '';
            let sub_title_id = '', sub_title_name = '';
            let chapter_id = '', chapter_name = '';
            let sub_chapter_id = '', sub_chapter_name = '';
            let section_id = '', section_name = '';
            let sub_section_id = '', sub_section_name = '';
            let ariaLevel = '';

            // Navigate up to find the closest section and check heading levels
            let currentElement = article.closest('section');
            while (currentElement) {
                const heading = currentElement.querySelector('.heading');
                if (heading) {
                    const headingText = heading.textContent.trim();
                    const matches = headingText.match(/\d+/);
                    const id = matches ? matches[0] : '';

                    // when section is empty fill section with text of heading
                    if (sub_section_name === '') {
                        sub_section_name = headingText;
                        sub_section_id = id;

                    } else if (section_name === '') {
                        section_name = headingText;
                        section_id = id;
                       
                    } else if (sub_chapter_name === '') {
                        sub_chapter_name = headingText;
                        sub_chapter_id = id;

                    }else if (chapter_name === '') {
                        chapter_name = headingText;
                        chapter_id = id;

                    } else if (sub_title_name === '') {
                        sub_title_name = headingText;
                        sub_title_id = id;    

                    } else if (title_name === '') {
                        title_name = headingText;
                        title_id = id;

                    } else if (part_name === '') {
                        part_name = headingText;
                        part_id = id;

                    } else if (book_name === '') {
                        book_name = headingText;
                        book_id = id;
                    }
                }
                // Continue up the hierarchy only if necessary
                if (heading && (heading.tagName !== 'H1' && ariaLevel !== '1' )) {
                    currentElement = currentElement.parentElement.closest('section');
                    continue;
                }
                break; // No need to go further if we've processed an H1 
            }

            const articleId = article.id; // Assumes article IDs are in the format 'art_X'
            // Safely extract article name considering nested elements
            const headingElement = article.querySelector('.heading');

            let articleName = headingElement ? headingElement.innerText.trim() : '';

            let footnoteTextForHeading = '';

            if (headingElement) {
                const footnotesInHeading = headingElement.querySelectorAll('sup a');
                for (const anchor of footnotesInHeading) {
                    const fragment = anchor.getAttribute('href').split('#')[1];
                    if (fragment) {
                        const footnoteElement = document.querySelector(`div.footnotes *[id="${fragment}"]`);
                        if (footnoteElement) {
                            const footnoteContent = footnoteElement.textContent.trim();
                            footnoteTextForHeading += ` footnote{${footnoteContent}}`;
                            anchor.outerHTML = ''; // Remove the sup element from the heading
                        }
                    }
                }
                // Refresh the article name to remove any unwanted characters that were inside <sup> tags
                articleName = headingElement.textContent.trim() + footnoteTextForHeading;
            }
            
            const paragraphs = article.querySelectorAll('div.collapseable > p, div.collapseable > dl, div.collapseable > div.table');
            let ziffer_name = ''; // This will store the name or content of italic paragraphs
            let ziffer_id = ''; // This will store the id of the ziffer   
            let reference = '';
            let prepend = '';
            paragraphs.forEach((element, index) => {
                let absatz = '';
            
                if (element.firstChild && element.firstChild.tagName === 'SUP') {
                    // Check if the first child node of the paragraph is a <sup> element
                    absatz = element.firstChild.textContent.trim();
                    // check if the next sibling is a sup element
                    sibling = element.firstChild.nextSibling;
                    if (sibling && ((sibling.tagName === 'SUP' && sibling.firstChild.tagName !== 'A') || (sibling.tagName === 'I' && sibling.firstChild.tagName === 'SUP')) ) {
                        // check if the sub is not a a tag
                        if (sibling.firstChild.tagName !== 'A') {
                            absatz += sibling.textContent.trim();
                        } 
                    }
                }
            
                let textWithFootnotes = element.innerHTML.trim();
                const footnotesAnchors = element.querySelectorAll('sup a');
            
                const processFootnotes = (textElement) => {
                    const anchors = textElement.querySelectorAll('sup a');
                    for (const anchor of anchors) {
                        const fragment = anchor.getAttribute('href').split('#')[1];
                        if (fragment) {
                            const footnoteElement = document.querySelector(`div.footnotes *[id="${fragment}"]`);
                            if (footnoteElement) {
                                const footnoteText = ` footnote{${footnoteElement.textContent.trim()}}`;
                                anchor.outerHTML = footnoteText;
                            }
                        }
                    }
                    return textElement.textContent.trim();
                };
            
                // Check if the paragraph is italic and start with a number
                const style = window.getComputedStyle(element);
                const v = processFootnotes(element);
                if (style.fontStyle === 'italic' && ( /^\d/.test(v) || v.toLowerCase() === 'übergangsbestimmung' ))   {
                    ziffer_name = processFootnotes(element);
                    // Extract the first numeric value as ziffer_id
                    const matches = ziffer_name.match(/\d+/); // Regex to find the first sequence of digits
                    if (matches) {
                        ziffer_id = matches[0]; // Assign the first matching group as the ziffer_id
                    }
                } else if (style.fontStyle === 'italic') { // store the italic text in prepend variable
                    prepend = processFootnotes(element);
                    // if prepend is not empty and ends with :
                    if (prepend.trim().endsWith(':')) {
                        prepend = prepend.trim(); // Remove any extra spaces
                    } else { // if prepend is not empty and does not end with : then append it to the last inserted paragraph's text
                        if (results.length > 0 && results[results.length - 1])   {
                            let lastIndex = results.length - 1; // To avoid multiple access to results.length - 1
                            results[lastIndex].text_w_footnotes = `${results[lastIndex].text_w_footnotes}\n${prepend}`;
                            prepend = ''; // Reset the prepend after appending it
                        }    
                    }

                } else if (element.tagName.toLowerCase() === 'p' && element.classList.contains('referenz')) {
                    console.log('reference', element);
                    reference = processFootnotes(element);
                } else if (element.tagName.toLowerCase() === 'dl' && results.length > 0) {
                    const dlText = Array.from(element.children).map(dlChild => {
                        if (dlChild.tagName.toLowerCase() === 'dt') {
                            return `\n${processFootnotes(dlChild)}:`;
                        } else if (dlChild.tagName.toLowerCase() === 'dd') {
                            return ` ${processFootnotes(dlChild)}`;
                        }
                        return '';
                    }).join('');
                
                    // Append DL text to the last inserted paragraph's text
                    results[results.length - 1].text_w_footnotes += dlText;

                } else if (element.className.toLowerCase() === 'table' && results.length > 0) {
                    const tableText = Array.from(element.querySelectorAll('tr')).map(tr => {
                        return Array.from(tr.querySelectorAll('td')).map(td => {
                            return processFootnotes(td); // Process each cell similarly
                        }).join(' | '); // Separate columns by " | "
                    }).join('\n'); // Separate rows by new line
            
                    // Append table text to the last inserted paragraph's text with an "absatz" separator
                    results[results.length - 1].text_w_footnotes += `\n ${tableText}\n`;
                    results[results.length - 1].text_w_footnotes += tableText;  

                    // append p tag text to the last inserted paragraph's text if absatz is empty AND same article_id
                } else if (element.tagName.toLowerCase() === 'p' && results.length > 0 && results[results.length - 1].article_id.trim() === articleId.trim() && (absatz.trim().length === 0 || results[results.length - 1].absatz.trim() === absatz.trim())) {
                    results[results.length - 1].text_w_footnotes += `\n${processFootnotes(element)}\n`; 

                } else {
                    textWithFootnotes = processFootnotes(element); // Process any footnotes within <p> or similar tags

                    // Prepend the reference to the text if it exists
                    if (prepend && textWithFootnotes.trim().length > 0 && prepend.trim().length > 0) {
                        console.log('prepending reference', reference);
                        textWithFootnotes = `SubTitle{ ${prepend}}\n ${textWithFootnotes}`;
                        prepend = ''; // Reset the reference after prepending it
                    }  

                    if (textWithFootnotes.trim().length > 0) {
                        results.push({
                            srn: srn, 
                            shortName: shortName,
                            book_id: book_id,
                            book_name: book_name,
                            part_id: part_id,
                            part_name: part_name,
                            title_id: title_id,
                            title_name: title_name,
                            sub_title_id: sub_title_id,
                            sub_title_name: sub_title_name,
                            chapter_id: chapter_id,
                            chapter_name: chapter_name,
                            sub_chapter_id: sub_chapter_id,
                            sub_chapter_name: sub_chapter_name,
                            section_id: section_id,
                            section_name: section_name,
                            sub_section_id: sub_section_id,
                            sub_section_name: sub_section_name,
                            article_id: articleId,
                            article_name: articleName,
                            reference: reference,
                            ziffer_id: ziffer_id,
                            ziffer_name: ziffer_name, 
                            absatz: absatz,
                            text_w_footnotes: textWithFootnotes
                        });
                    }
                }
            });
        });
        return results;
    }, srn, shortName); // Pass the srn and shortName to the page context
    return articlesData;
}

const db = new Database();

//db.dropTable('lawText')
//db.dropTable('articles')
//db.dropTable('errorLog')
//db.dropTable('lawText_history')
//db.dropTable('articles_history')
db.createTables();
db.createErrorTable();
db.createHistoryTables();

// Start the scraping process after finisching close the connection to db with db.close()
scrapeWebsite().catch(console.error);