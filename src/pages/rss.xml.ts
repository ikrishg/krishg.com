import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { description, site, title } from '~shared';

export async function GET() {
  const articles = [
    ...(await getCollection('articles')).filter(post => !post.data.draft),
    ...(await getCollection('essays')).filter(post => !post.data.draft),
    ...(await getCollection('poems')).filter(post => !post.data.draft),
  ];

  const feedUrl = new URL('rss.xml', site).href;

  return rss({
    title,
    description,
    site,
    xmlns: {
      atom: 'http://www.w3.org/2005/Atom',
      dc: 'http://purl.org/dc/elements/1.1/',
    },
    customData: `<atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>`,
    items: articles.map((post) => {
      const link = new URL(`/p/${post.id}/`, site).href;
      return {
        title: post.data.title,
        link,
        description: post.data.description,
        categories: post.data.tags,
        content: post.rendered?.html,
        pubDate: post.data.date,
        customData: '<dc:creator>Krish Gupta</dc:creator>',
      };
    }),
  });
}
