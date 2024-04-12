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

        await page.goto('https://www.gesetze.ch/');

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

            await subPage.goto(link);
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
    await page.goto(url);

    // Wait for the content to load, adjust the selector as needed
    await page.waitForSelector('#content');

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
        
        await page.goto(url, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#preface'); // Ensure the 'preface' div is fully loaded

        // Extract static data with corrected selectors
        const srnNummer = await page.$eval('#preface .srnummer', el => el.textContent.trim());
        const title = await page.$eval('#preface h1', el => {
            // Replace <br> tags with a space
            el.querySelectorAll('br').forEach(br => br.replaceWith(' '));
            // Return the modified text content, trimming to remove extra spaces
            return el.textContent.trim();
        });
        const preface = await page.evaluate(() => {

            // Extract the text content of the element with id 'preface' exept the h1 element and except the tag with class 'srnummer'
            const element = document.querySelector('#preface');
            
            if (element) {
                element.querySelectorAll('br').forEach(br => br.replaceWith(' '));
                const h1Element = element.querySelector('h1');
                if (h1Element) {
                    // Remove the h1 element from the parent element
                    h1Element.remove();
                }
                const srnummerElement = element.querySelector('.srnummer');
                if (srnummerElement) {
                    // Remove the srnummer element from the parent element
                    srnummerElement.remove();
                }
            } 
            
            return element ? element.textContent.trim() : " ";
        });
        const preamble = await page.$eval('#preamble', el => el.innerText.trim());
        const status = await page.evaluate(() => {
            const inForceStatus = document.querySelector('#sidebar app-in-force-status .soft-green');
            return inForceStatus ? "in Kraft" : "nicht in Kraft";
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
            srnNummer,
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

        const articlesData = await extractArticles(page, lawTextData.srnNummer, lawTextData.shortName);

        // Insert each article paragraph data into the database
        for (const data of articlesData) {
            await db.insertArticle(data);
            //console.log(data);
        }
        


    } catch (error) {
        console.error('Error navigating to or processing law text:', error.message);
       
    }
}

async function extractArticles(page, srnNummer, shortName) {
    // Extract and insert articles into the database
    const articlesData = await page.evaluate((srnNummer, shortName) => {
        const articles = Array.from(document.querySelectorAll('article'));
        const results = [];

        articles.forEach(article => {
            const articleId = article.id; // Assumes article IDs are in the format 'art_X'
            // Safely extract article name considering nested elements
            const headingElement = article.querySelector('h6.heading');

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
                            footnoteTextForHeading += ` footnote(${footnoteContent})`;
                            anchor.outerHTML = ''; // Remove the sup element from the heading
                        }
                    }
                }
                // Refresh the article name to remove any unwanted characters that were inside <sup> tags
                articleName = headingElement.textContent.trim() + footnoteTextForHeading;
            }
            
            const paragraphs = article.querySelectorAll('div.collapseable > p, div.collapseable > dl');

            paragraphs.forEach((element, index) => {
                // Initial check if the element is <dl> to append it to the previous textWithFootnotes
                if (element.tagName.toLowerCase() === 'dl' && results.length > 0) {
                    const dlText = Array.from(element.children).map(dlChild => {
                        if (dlChild.tagName.toLowerCase() === 'dt') {
                            return `\n${dlChild.textContent.trim()}:`;
                        } else if (dlChild.tagName.toLowerCase() === 'dd') {
                            return ` ${dlChild.textContent.trim()}`;
                        }
                        return '';
                    }).join('');

                    // Append DL text to the last inserted paragraph's text
                    results[results.length - 1].text_w_footnotes += dlText;
                } else {
                    let absatz = '';
                    if (element.firstChild && element.firstChild.tagName === 'SUP') {
                        // Check if the first child node of the paragraph is a <sup> element
                        absatz = element.firstChild.textContent.trim();
                    }
                    let textWithFootnotes = element.innerHTML.trim();
                    const footnotesAnchors = element.querySelectorAll('sup a');

                    for (const anchor of footnotesAnchors) {
                        // Extract the fragment identifier from the anchor's href attribute
                        const fragment = anchor.getAttribute('href').split('#')[1];
                        if (fragment) {
                            // Find the footnote in the document using the extracted fragment
                            const footnoteElement = document.querySelector(`div.footnotes *[id="${fragment}"]`);
                            if (footnoteElement) {
                                // Construct the footnote text
                                const footnoteText = ` footnote(${footnoteElement.textContent.trim()})`;
                                // Replace the anchor's HTML with the footnote text
                                anchor.outerHTML = footnoteText;
                            }
                        }
                    }

                    textWithFootnotes = element.textContent.trim(); 

                    results.push({
                        srnNummer: srnNummer, 
                        shortName: shortName,
                        article_id: articleId,
                        article_name: articleName,
                        absatz: absatz,
                        text_w_footnotes: textWithFootnotes
                    });
                }
            });
        });

        return results;
    }, srnNummer, shortName); // Pass the srnNummer and shortName to the page context
    return articlesData;
}

const db = new Database();

//db.dropTable('lawText')
//db.dropTable('articles')
//db.dropTable('errorLog')
//db.createTables();
//db.createErrorTable();

// Start the scraping process after finisching close the connection to db with db.close()
scrapeWebsite().catch(console.error);