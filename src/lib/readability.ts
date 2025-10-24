/**
 * TypeScript port of the python-readability library.
 * This file is structured as a module to be imported into other projects.
 * * Main export:
 * - Document (class)
 * - DocumentOptions (interface)
 * - UnparseableError (class)
 * * Dependencies:
 * - jsdom (npm install jsdom)
 */

import { JSDOM } from 'jsdom';

// Type definitions for DOM elements
type DOMElement = globalThis.Element;
type DOMDocument = globalThis.Document;

// Replaces the Python REGEXES
const REGEXES = {
    unlikelyCandidatesRe: /combx|comment|community|disqus|extra|foot|header|menu|remark|rss|shoutbox|sidebar|sponsor|ad-break|agegate|pagination|pager|popup|tweet|twitter/i,
    okMaybeItsACandidateRe: /and|article|body|column|main|shadow/i,
    positiveRe: /article|body|content|entry|hentry|main|page|pagination|post|text|blog|story/i,
    negativeRe: /combx|comment|com-|contact|foot|footer|footnote|masthead|media|meta|outbrain|promo|related|scroll|shoutbox|sidebar|sponsor|shopping|tags|tool|widget/i,
    divToPElementsRe: /<(a|blockquote|dl|div|img|ol|p|pre|table|ul)/i,
    videoRe: /https?:\/\/(www\.)?(youtube|vimeo)\.com/i,
};

// Custom Error
export class UnparseableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UnparseableError";
    }
}

// --- Internal Helper Functions ---

/**
 * Converts 'px' and 'em' values to integers.
 */
/*function toInt(x: string | null | undefined): number | null {
    if (!x) return null;
    x = x.trim();
    if (x.endsWith("px")) return parseInt(x.slice(0, -2), 10);
    if (x.endsWith("em")) return parseInt(x.slice(0, -2), 10) * 12;
    const val = parseInt(x, 10);
    return isNaN(val) ? null : val;
}*/

/**
 * Cleans whitespace from a string.
 */
function clean(text: string | null | undefined): string {
    if (!text) return "";
    text = text.replace(/\s{255,}/g, " ".repeat(255));
    text = text.replace(/\s*\n\s*/g, "\n");
    text = text.replace(/\t|[ \t]{2,}/g, " ");
    return text.trim();
}

/**
 * Gets the length of an element's cleaned text content.
 */
function text_length(i: DOMElement): number {
    return clean(i.textContent).length;
}

/**
 * Compiles keyword patterns into a RegExp.
 */
function compilePattern(elements: string | string[] | RegExp | null | undefined): RegExp | null {
    if (!elements) return null;
    if (elements instanceof RegExp) return elements;
    
    let patterns: string[] = [];
    if (typeof elements === 'string') {
        patterns = elements.split(",");
    } else if (Array.isArray(elements)) {
        patterns = elements;
    } else {
        throw new Error(`Unknown type for pattern: ${typeof elements}`);
    }
    
    // Escape special characters for RegExp
    const escaped = patterns.map(x => x.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    // 'u' for unicode support, similar to Python's re.U
    return new RegExp(escaped.join("|"), "u");
}

// --- Stubs for External Dependencies ---
// (Replace these with your actual implementations of readability.htmls, etc.)

function _stub_html_cleaner(doc: DOMDocument): DOMDocument {
    console.warn("Using STUBBED html_cleaner");
    // A real cleaner would remove comments, etc.
    return doc;
}

function _stub_clean_attributes(html: string): string {
    console.warn("Using STUBBED clean_attributes");
    // A real cleaner would remove style="", onclick="", etc.
    return html;
}

/**
 * Describes an element for debugging.
 */
function describe(elem: DOMElement): string {
    const id = elem.id ? `#${elem.id}` : "";
    const cl = elem.className ? `.${elem.className.split(" ").join(".")}` : "";
    return `<${elem.tagName.toLowerCase()}${id}${cl}>`;
}
// --- End of Stubs ---

/**
 * Options for the Document constructor.
 */
export interface DocumentOptions {
    positive_keywords?: string | string[] | RegExp;
    negative_keywords?: string | string[] | RegExp;
    url?: string;
    min_text_length?: number;
    retry_length?: number;
    xpath?: boolean;
    handle_failures?: "discard" | "ignore" | null;
}

// Type for candidate nodes
interface Candidate {
    content_score: number;
    elem: DOMElement;
}

/**
 * Main class for content extraction.
 */
export class Document {
    private input: string;
    private dom: JSDOM | null = null;
    private html: DOMDocument | null = null; // The jsdom document
    //private encoding: string | null = null;

    private positive_keywords: RegExp | null;
    private negative_keywords: RegExp | null;
    private url?: string;
    private min_text_length: number;
    private retry_length: number;
    private xpath: boolean;

    constructor(input: string, options: DocumentOptions = {}) {
        this.input = input;
        this.positive_keywords = compilePattern(options.positive_keywords);
        this.negative_keywords = compilePattern(options.negative_keywords);
        this.url = options.url;
        this.min_text_length = options.min_text_length ?? 25;
        this.retry_length = options.retry_length ?? 250;
        this.xpath = options.xpath ?? false;
        // handle_failures is not really applicable to jsdom in the same way
    }

    /**
     * Parses and retrieves the DOM document.
     */
    private _html(force: boolean = false): DOMDocument {
        if (force || !this.html) {
            this._parse(this.input);
        }
        if (!this.html) {
            throw new Error("Failed to parse HTML document.");
        }
        return this.html;
    }

    /**
     * Internal parsing logic.
     */
    private _parse(input: string) {
        // Simulates readability.htmls.build_doc
        this.dom = new JSDOM(input, { url: this.url });
        this.html = this.dom.window.document;
        //this.encoding = "utf-8"; // JSDOM handles encoding

        // Simulates readability.cleaners.html_cleaner
        this.html = _stub_html_cleaner(this.html);

        // JSDOM automatically handles absolute links if 'url' is provided.
        
        if (this.xpath) {
            console.warn("The XPath option ('x' attribute) is not supported in this JS port.");
        }
    }

    /**
     * Simulates readability.htmls.get_body
     */
    public content(): DOMElement {
        return this._html(true).body;
    }

    /**
     * Simulates readability.htmls.get_title
     */
    public title(): string {
        return this._html(true).title;
    }

    /**
     * Simulates readability.htmls.shorten_title
     */
    public short_title(): string {
        const title = this.title();
        // Simple simulation of shorten_title
        return title.split(/ [|\-_»] /)[0].trim();
    }

    /**
     * Simulates readability.cleaners.clean_attributes
     */
    public get_clean_html(): string {
        const html = this.html?.documentElement.outerHTML || "";
        return _stub_clean_attributes(html);
    }

    /**
     * Main article extraction method.
     */
    public summary(html_partial: boolean = false): string {
        try {
            let ruthless = true;
            while (true) {
                const doc = this._html(true);
                
                // Remove <script> and <style>
                this.tags(doc, "script", "style").forEach(i => i.remove());
                
                // Add ID to body
                this.tags(doc, "body").forEach(i => i.setAttribute("id", "readabilityBody"));
                
                if (ruthless) {
                    this.remove_unlikely_candidates();
                }
                this.transform_misused_divs_into_paragraphs();
                const candidates = this.score_paragraphs();

                const best_candidate = this.select_best_candidate(candidates);

                let article: DOMElement | null;

                if (best_candidate) {
                    article = this.get_article(candidates, best_candidate, html_partial);
                } else {
                    if (ruthless) {
                        console.info("Ruthless stripping did not work.");
                        ruthless = false;
                        console.debug("Stripped too much - re-parsing.");
                        continue;
                    } else {
                        console.debug("No candidate found. Returning raw body.");
                        article = doc.querySelector("body");
                        if (!article) {
                            article = doc.documentElement;
                        }
                    }
                }

                const cleaned_article_html = this.sanitize(article!, candidates);
                const article_length = clean(article!.textContent).length;
                const of_acceptable_length = article_length >= this.retry_length;

                if (ruthless && !of_acceptable_length) {
                    ruthless = false;
                    continue;
                } else {
                    return cleaned_article_html;
                }
            }
        } catch (e) {
            console.error("Error getting summary: ", e);
            throw new UnparseableError((e as Error).message);
        }
    }

    /**
     * Constructs the final article from the best candidate and its siblings.
     */
    public get_article(candidates: Map<DOMElement, Candidate>, best_candidate: Candidate, html_partial: boolean = false): DOMElement {
        const sibling_score_threshold = Math.max(10, best_candidate.content_score * 0.2);
        
        let output: DOMElement;
        let container: DOMElement;
        const doc = this._html();

        if (html_partial) {
            // fragment_fromstring("<div/>")
            container = doc.createElement("div");
            output = container;
        } else {
            // document_fromstring("<div/>")
            // In JSDOM, we create a new document to isolate nodes.
            const newDoc = new JSDOM("<div></div>").window.document;
            container = newDoc.body.firstElementChild!;
            output = container;
        }

        const best_elem = best_candidate.elem;
        const parent = best_elem.parentElement;
        const siblings = parent ? Array.from(parent.children) : [best_elem];

        for (const sibling of siblings) {
            let append = false;
            if (sibling === best_elem) {
                append = true;
            }
            
            const candidate = candidates.get(sibling);
            if (candidate && candidate.content_score >= sibling_score_threshold) {
                append = true;
            }

            if (sibling.tagName === "P") {
                const link_density = this.get_link_density(sibling);
                const node_content = sibling.textContent || "";
                const node_length = node_content.length;

                if (node_length > 80 && link_density < 0.25) {
                    append = true;
                } else if (node_length <= 80 && link_density === 0 && /\.( |$)/.test(node_content)) {
                    append = true;
                }
            }

            if (append) {
                // Import the node into the 'output' document if it's different.
                if (container.ownerDocument !== sibling.ownerDocument) {
                    const importedNode = container.ownerDocument.importNode(sibling, true);
                    container.append(importedNode);
                } else {
                    // If html_partial=true, we move the node from the original tree.
                    container.append(sibling);
                }
            }
        }
        return output;
    }

    /**
     * Selects the best candidate from the list.
     */
    public select_best_candidate(candidates: Map<DOMElement, Candidate>): Candidate | null {
        if (candidates.size === 0) return null;

        const sorted_candidates = Array.from(candidates.values()).sort(
            (a, b) => b.content_score - a.content_score
        );
        
        sorted_candidates.slice(0, 5).forEach(candidate => {
            console.debug(`Top 5 : ${candidate.content_score.toFixed(3)} ${describe(candidate.elem)}`);
        });

        return sorted_candidates[0];
    }

    /**
     * Calculates the link density of an element.
     */
    public get_link_density(elem: DOMElement): number {
        const links = Array.from(elem.querySelectorAll("a"));
        let link_length = 0;
        for (const i of links) {
            link_length += text_length(i);
        }
        const total_length = text_length(elem);
        return link_length / Math.max(total_length, 1);
    }

    /**
     * Scores paragraphs and their parents as candidates.
     */
    public score_paragraphs(): Map<DOMElement, Candidate> {
        const MIN_LEN = this.min_text_length;
        const candidates = new Map<DOMElement, Candidate>();
        const ordered: DOMElement[] = []; // To preserve insertion order
        
        const elems = this.tags(this._html(), "p", "pre", "td");
        
        for (const elem of elems) {
            const parent_node = elem.parentElement;
            if (!parent_node) continue;
            const grand_parent_node = parent_node.parentElement;

            const inner_text = clean(elem.textContent);
            const inner_text_len = inner_text.length;

            if (inner_text_len < MIN_LEN) continue;

            if (!candidates.has(parent_node)) {
                candidates.set(parent_node, this.score_node(parent_node));
                ordered.push(parent_node);
            }

            if (grand_parent_node && !candidates.has(grand_parent_node)) {
                candidates.set(grand_parent_node, this.score_node(grand_parent_node));
                ordered.push(grand_parent_node);
            }

            let content_score = 1;
            content_score += inner_text.split(",").length;
            content_score += Math.min(Math.floor(inner_text_len / 100), 3);
            
            candidates.get(parent_node)!.content_score += content_score;
            if (grand_parent_node) {
                candidates.get(grand_parent_node)!.content_score += content_score / 2.0;
            }
        }

        // Scale score based on link density
        for (const elem of ordered) {
            const candidate = candidates.get(elem)!;
            const ld = this.get_link_density(elem);
            candidate.content_score *= (1 - ld);
        }

        return candidates;
    }

    /**
     * Calculates the weight of a node based on its class and ID.
     */
    public class_weight(e: DOMElement): number {
        let weight = 0;
        const features = [e.getAttribute("class"), e.getAttribute("id")];
        
        for (const feature of features) {
            if (feature) {
                if (REGEXES.negativeRe.test(feature)) weight -= 25;
                if (REGEXES.positiveRe.test(feature)) weight += 25;
                if (this.positive_keywords && this.positive_keywords.test(feature)) weight += 25;
                if (this.negative_keywords && this.negative_keywords.test(feature)) weight -= 25;
            }
        }

        const tag = e.tagName.toLowerCase();
        if (this.positive_keywords && this.positive_keywords.test("tag-" + tag)) weight += 25;
        if (this.negative_keywords && this.negative_keywords.test("tag-" + tag)) weight -= 25;

        return weight;
    }

    /**
     * Scores a node based on its tag.
     */
    public score_node(elem: DOMElement): Candidate {
        let content_score = this.class_weight(elem);
        const name = elem.tagName.toLowerCase();

        if (["div", "article"].includes(name)) content_score += 5;
        else if (["pre", "td", "blockquote"].includes(name)) content_score += 3;
        else if (["address", "ol", "ul", "dl", "dd", "dt", "li", "form", "aside"].includes(name)) content_score -= 3;
        else if (["h1", "h2", "h3", "h4", "h5", "h6", "th", "header", "footer", "nav"].includes(name)) content_score -= 5;
        
        return { content_score, elem };
    }

    /**
     * Removes elements that are unlikely to be content.
     */
    public remove_unlikely_candidates() {
        const doc = this._html();
        const elems = Array.from(doc.querySelectorAll("*")); // .//*
        for (const elem of elems) {
            const s = `${elem.getAttribute("class") || ""} ${elem.getAttribute("id") || ""}`;
            if (s.length < 2) continue;
            
            if (
                REGEXES.unlikelyCandidatesRe.test(s) &&
                !REGEXES.okMaybeItsACandidateRe.test(s) &&
                !["HTML", "BODY"].includes(elem.tagName)
            ) {
                console.debug(`Removing unlikely candidate: ${describe(elem)}`);
                elem.remove(); // drop_tree()
            }
        }
    }

    /**
     * Transforms <div>s that are used as <p>s into <p> tags.
     * This is the most complex part of the lxml -> jsdom translation.
     */
    public transform_misused_divs_into_paragraphs() {
        const doc = this._html();
        
        // First loop: div -> p
        for (const elem of this.tags(doc, "div")) {
            // Check if direct children are block elements
            const childrenHTML = Array.from(elem.children).map(c => c.outerHTML).join("");
            
            if (!REGEXES.divToPElementsRe.test(childrenHTML)) {
                // Replace tag: create <p>, move content, replace
                const p = doc.createElement("p");
                // Move attributes
                for (const attr of Array.from(elem.attributes)) {
                    p.setAttribute(attr.name, attr.value);
                }
                // Move child nodes (including text)
                while (elem.firstChild) {
                    p.appendChild(elem.firstChild);
                }
                // Replace the old <div> with the new <p>
                elem.parentElement?.replaceChild(p, elem);
            }
        }

        // Second loop: handle direct text and "tail text"
        for (const elem of this.tags(doc, "div")) {
            // Handle `elem.text` (direct child text nodes)
            const directTextNodes = Array.from(elem.childNodes).filter(
                n => n.nodeType === 3 /* TEXT_NODE */ && n.textContent?.trim()
            );

            if (directTextNodes.length > 0) {
                const p = doc.createElement("p");
                p.textContent = directTextNodes.map(n => n.textContent).join(" ");
                // Insert the new <p> at the beginning of the <div>
                elem.prepend(p);
                // Remove the old text nodes
                directTextNodes.forEach(n => n.remove());
            }

            // Handle `child.tail`
            // Iterate backwards over childNodes
            const children = Array.from(elem.childNodes);
            for (let i = children.length - 1; i >= 0; i--) {
                const child = children[i];
                const nextSibling = child.nextSibling;

                // If the *next* node is a non-empty text node
                if (nextSibling && nextSibling.nodeType === 3 && nextSibling.textContent?.trim()) {
                    const p = doc.createElement("p");
                    p.textContent = nextSibling.textContent;
                    // Insert the new <p> *after* the text node
                    elem.insertBefore(p, nextSibling.nextSibling);
                    // Remove the text node
                    nextSibling.remove();
                }

                // Remove <br>
                if (child.nodeType === 1 && (child as DOMElement).tagName === "BR") {
                    child.remove();
                }
            }
        }
    }

    /**
     * Utility to replace `findall`
     */
    public tags(node: DOMDocument | DOMElement, ...tag_names: string[]): DOMElement[] {
        const selector = tag_names.join(",");
        return Array.from(node.querySelectorAll(selector));
    }

    /**
     * Utility for `reverse_tags`
     */
    public reverse_tags(node: DOMElement, ...tag_names: string[]): DOMElement[] {
        return this.tags(node, ...tag_names).reverse();
    }

    /**
     * Cleans the final extracted article.
     */
    public sanitize(node: DOMElement, candidates: Map<DOMElement, Candidate>): string {
        const MIN_LEN = this.min_text_length;

        this.tags(node, "h1", "h2", "h3", "h4", "h5", "h6").forEach(header => {
            if (this.class_weight(header) < 0 || this.get_link_density(header) > 0.33) {
                header.remove();
            }
        });

        this.tags(node, "form", "textarea").forEach(elem => elem.remove());

        this.tags(node, "iframe").forEach(elem => {
            const src = elem.getAttribute("src");
            if (src && REGEXES.videoRe.test(src)) {
                elem.textContent = "VIDEOVIDEOVIDEOVIDEOVIDEOVIDEO";
            } else {
                elem.remove();
            }
        });

        const allowed = new Set<DOMElement>();

        this.reverse_tags(node, "table", "ul", "div", "aside", "header", "footer", "section")
            .forEach(el => {
                if (allowed.has(el)) return;
                
                const weight = this.class_weight(el);
                const content_score = candidates.get(el)?.content_score ?? 0;
                const tag = el.tagName.toLowerCase();

                if (weight + content_score < 0) {
                    console.debug(`Removed (negative score/weight): ${describe(el)}`);
                    el.remove();
                } else if ((el.textContent || "").replace(/,/g, "").length < 10) {
                    // Python's counting logic
                    const counts: { [key: string]: number } = {};
                    for (const kind of ["p", "img", "li", "a", "embed", "input"]) {
                        counts[kind] = this.tags(el, kind).length;
                    }
                    counts["li"] -= 100;
                    counts["input"] -= this.tags(el, 'input[type="hidden"]').length;

                    const content_length = text_length(el);
                    const link_density = this.get_link_density(el);
                    
                    let to_remove = false;
                    let reason = "";

                    if (counts["p"] && counts["img"] > 1 + counts["p"] * 1.3) {
                        reason = `too many images (${counts["img"]})`; to_remove = true;
                    } else if (counts["li"] > counts["p"] && !["ol", "ul"].includes(tag)) {
                        reason = "more <li>s than <p>s"; to_remove = true;
                    } else if (counts["input"] > (counts["p"] / 3)) {
                        reason = "less than 3x <p>s than <input>s"; to_remove = true;
                    } else if (content_length < MIN_LEN && counts["img"] === 0) {
                        reason = `too short content length (${content_length}) without a single image`; to_remove = true;
                    } else if (content_length < MIN_LEN && counts["img"] > 2) {
                        reason = `too short content length (${content_length}) and too many images`; to_remove = true;
                    } else if (weight < 25 && link_density > 0.2) {
                        reason = `too many links ${link_density.toFixed(3)} for its weight ${weight}`; to_remove = true;
                    } else if (weight >= 25 && link_density > 0.5) {
                        reason = `too many links ${link_density.toFixed(3)} for its weight ${weight}`; to_remove = true;
                    } else if ((counts["embed"] === 1 && content_length < 75) || counts["embed"] > 1) {
                        reason = "<embed>s with too short content length, or too many <embed>s"; to_remove = true;
                    } else if (!content_length) {
                        reason = "no content"; to_remove = true;
                    }
                    
                    // Sibling check logic
                    if (to_remove) {
                        let x = 1, i = 0, j = 0;
                        const siblings: number[] = [];
                        
                        let sib = el.nextElementSibling;
                        while(sib && i < x) {
                            const sib_len = text_length(sib);
                            if (sib_len) { i++; siblings.push(sib_len); }
                            sib = sib.nextElementSibling;
                        }
                        
                        sib = el.previousElementSibling;
                        while(sib && j < x) {
                            const sib_len = text_length(sib);
                            if (sib_len) { j++; siblings.push(sib_len); }
                            sib = sib.previousElementSibling;
                        }

                        const sibling_sum = siblings.reduce((a, b) => a + b, 0);
                        if (sibling_sum > 1000) {
                            to_remove = false;
                            console.debug(`Allowing (important siblings): ${describe(el)}`);
                            this.tags(el, "table", "ul", "div", "section").forEach(desnode => {
                                allowed.add(desnode);
                            });
                        }
                    }

                    if (to_remove) {
                        console.debug(`Removed: ${describe(el)} (Reason: ${reason})`);
                        el.remove();
                    }
                }
            });

        // Apply the clean_attributes stub to the final HTML
        return _stub_clean_attributes(node.outerHTML);
    }
}

/**
 * Usage Example:
import { Document, DocumentOptions } from './readability';

const html = "<html>...</html>";
const options: DocumentOptions = { url: "https://example.com" };
const doc = new Document(html, options);

console.log(doc.title());
console.log(doc.summary());
 */