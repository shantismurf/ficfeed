import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

var channels = [];
let sendchannel = '';
const msgurl = `https://discord.com/api/v10/channels/{}/messages?limit=30`;
const cache = {};
const getchurl = `https://discord.com/api/v10/guilds/${process.env.GUILD}/channels`;
const seen = new Set();
const chnames = (process.env.CHANNELS ?? '').split(',');
const toamt = process.env.TIMEOUT ?? 60;

async function fetchData() {
  if (cache[getchurl]) {
    return cache[getchurl];
  }
  try {
    const response = await fetch(getchurl, {
      headers: {
        'Authorization': `Bot ${process.env.TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json();
    cache[getchurl] = data;
    return data;
  } catch (error) {
    console.error(error);
  }
}

async function getmsg(c, i) {
  const now = new Date();
  const timestampString = now.toISOString();
  console.log('Fetching channel ' + (i + 1) + '/' + channels.length + '...' + timestampString);
  var x = null;
  try {
    const response = await fetch(msgurl.replace('{}', c), {
      method: 'GET',
      headers: {
        'Authorization': `Bot ${process.env.TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    x = await response.json();
  } catch (e) {
    console.log('Error:', e.toString() + ' - ' + timestampString);
  }
  x = x instanceof Array ? x : [];
  return x.map(x => [x, c]);
}

async function fetchMessages(start) {
  try {
    var res = [].concat(...(await Promise.all(channels.map((x, i) =>
      new Promise(y => setTimeout(async () => y(await getmsg(x, i)), i * 7e3))
    ))));
    var newmsg = res.filter(msg => !seen.has(msg[0].id)).map(msg => {
      return msg.concat([(msg[0].content.match(/archiveofourown.org\/works\/\d{1,12}/g) ?? [])[0]]);
    }).filter(x => x[2] != undefined).sort((a, b) => new Date(b[0].timestamp).getTime() - new Date(a[0].timestamp).getTime());
    var to = -1;
    newmsg.forEach(async msg => {
      seen.add(msg[0].id);
      if (!start) {
        var ao3 = await ao3api('https://' + msg[2] + '/');
        to++;
        console.log('New Message:', msg[0].content);
        //set limits on summary and tag string lengths and append elipsis if truncated
        var summarystr = (ao3.summary ?? 'None').substring(0, 400);
        summarystr = summarystr.length == 400 ? summarystr + ' ...' : summarystr;
        var tagstr = (ao3.freeform ?? 'None').substring(0, 400);
        tagstr = tagstr.length == 400 ? tagstr + ' ...' : tagstr;
        setTimeout(() =>
          fetch(msgurl.replace('{}', sendchannel), {
            method: 'POST',
            headers: {
              'Authorization': `Bot ${process.env.TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(
              ao3.error ? {
                embeds: [{
                  title: 'Preview not available. Click here to see work.',
                  url: `https://${msg[2]}/`,
                  description:
                    `Posted by <@${msg[0].author.id}> in https://discord.com/channels/${process.env.GUILD}/${msg[1]}/${msg[0].id}`+ ao3.error,
                  color: 0x0000FF,
                }]
              } :
                {
                  embeds: [{
                    title: ao3.title,
                    url: `https://${msg[2]}/`,
                    description:
                      `Posted by <@${msg[0].author.id}> in https://discord.com/channels/${process.env.GUILD}/${msg[1]}/${msg[0].id}`,
                    color: ({
                      "Not Rated": 0x808080, "General Audiences": 0x0000FF,
                      "Teen And Up Audiences": 0x008000, "Mature": 0xFFA500, "Explicit": 0xFF0000
                    })[ao3.rating],
                    author: {
                      name: 'A work by ' + ao3.author,
                      url: ao3.authorlink,
                    },
                    fields: [
                      {
                        name: 'Published' + (ao3.status ? ' | Updated' : ''),
                        value: (ao3.published + (ao3.status ? ' | ' + ao3.status : '')).substring(0, 1024),
                        inline: true
                      },
                      {
                        name: 'Words | Chapters',
                        value: (ao3.words + ' | ' + ao3.chapters).substring(0, 1024),
                        inline: true,
                      },
                      {
                        name: 'Rating | Warning',
                        value: (ao3.rating + ' | ' + ao3.warning).substring(0, 1024),
                        // inline: true,
                      },
                      {
                        name: 'Tags',
                        value: tagstr,
                        inline: true,
                      },
                      {
                        name: 'Summary',
                        value: summarystr,
                        // inline: true,
                      },
                    ],
                    footer: {
                      text: ('Hits: ' + ao3.hits + ' | Kudos: ' + (ao3.kudos ?? 0) +
                        ' | Comments: ' + (ao3.comments ?? 0)).substring(0, 1024)
                    }
                  }]
                }
            ),
          }).then(e => e.json()).then(e => e.code ? console.log(JSON.stringify(e)) : ''),
          to * 5e3);
      }
    });
  } catch (e) {
    console.log('Error:', e.toString() + ' - ' + timestampString);
    async function getmsg(c, i) {
      try {
        const now = new Date();
        const timestampString = now.toISOString();
        console.log('Fetching channel ' + (i + 1) + '/' + channels.length + '...' + timestampString);
        const response = await fetch(msgurl.replace('{}', c), {
          method: 'GET',
          headers: {
            'Authorization': `Bot ${process.env.TOKEN}`,
            'Content-Type': 'application/json',
          },
        });
        const x = await response.json();
        return x.map(x => [x, c]);
      } catch (e) {
        console.log('Error:', e.toString() + ' - ' + timestampString);
      }
    }
  }
  if (start)
    console.log('Ready!');
  setTimeout(fetchMessages, toamt * 1);//e3);
  return res;
}
async function getch() {
  console.log('Fetching channels...');
  var res = await fetch(getchurl, {
    method: 'GET',
    headers: {
      'Authorization': `Bot ${process.env.TOKEN}`,
      'Content-Type': 'application/json'
    }
  }).then(x => x.json());
  res = res.filter(x => x.type == 0);
  sendchannel = res.splice(res.findIndex(x => x.name == process.env.FEED), 1)[0].id;
  channels = res.filter(x => chnames[0] == '' ? true : chnames.includes(x.name)).map(x => x.id);
  return;
}

async function ao3api(link) {
  var errorCount = 0;
  try {
    var res = await fetch(link).then(e => e.text());
    if (!res)
      return {error: true};
    var cur;
    var v = {};
    var rx = /<dd class="(.*?)(?<!stats)( tags)?">(.*?)<\/dd>/gs;
    while (cur = rx.exec(res)) {
      var ry = /(?<=<a class="tag" href=".*?">).*?(?=<\/a>)/gs;
      var ml = [];
      var m = '';
      var i = 0;
      while ((m = ry.exec(cur[3])) && i++ < 1000)
        ml.push(m);
      if (ml.length == 0)
        ml = [cur[3]];
      v[cur[1]] = ml.join(', ').replaceAll('&#39;', "'");
    };
    const titleMatch = res.match(/<h2 class="title heading">(.*?)<\/h2>/s);
    if (titleMatch) {
      v.title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
    } else {
      console.error('Failed to match title');
      v.title = '';
      errorCount++;
    }
    const authorMatch = res.match(/(?<=<a rel="author" href=".*?">).*?(?=<\/a>)/s);
    if (authorMatch) {
      v.author = authorMatch[0];
    } else {
      console.error('Failed to match author');
      v.author = '';
      errorCount++;
    }
    const authorLinkMatch = res.match(/(?<=<a rel="author" href=").*?(?=">)/s);
    if (authorLinkMatch) {
      v.authorlink = 'https://archiveofourown.org' + authorLinkMatch[0];
    } else {
      console.error('Failed to match author link');
      v.authorlink = '';
      errorCount++;
    }    
    const summaryMatch = res.match(/<h3 class="heading">Summary:<\/h3>\s*<blockquote class="userstuff">([\s\S]*?)<\/blockquote>/s);
    if (summaryMatch) {
      const summary = summaryMatch[0]
      .replace(/<(p|i|b)>/gs, (m, tag) => {
        switch (tag) {
          case 'p':
            return '\n' + m + '\n';
            case 'i':
              return '*$&*';
            case 'b':
              return '**$&**';
            default:
              return '';
          }
        })
        .replace(/<\/(p|i|b)>/gs, '')
        .replace(/<br\s*\/?>/gs, '\n')
        .replace(/Summary:/gs, '')
        .replace(/<[^>]*>/g, '').trim()
        .trim();
      v.summary = summary;
    } else {
      console.error('Failed to match summary');
      v.summary = '';
      errorCount++;
    }
    const publishedMatch = res.match(/<dd class="published">.*?<\/dd>/);
    if (publishedMatch) {
      v.published = publishedMatch[0].replace(/<dd class="published">|<\/dd>/g, '');
    } else {
      console.error('Failed to match published date');
      v.publishedDate = '';
      errorCount++;
    }
    const updatedDateMatch = res.match(/<dd class="status">(.*?)<\/dd>/);
    if (updatedDateMatch) {
      v.updatedDate = updatedDateMatch[1];
    } else {
      console.error('Failed to match updated date');
      v.updatedDate = '';
      errorCount++;
    }
    if (errorCount > 5) {
      return {error: true};
    }
    return v;
  } catch (e) {
    console.error(e)
    return { error: e }
  }
}

getch().then(() => {
  fetchMessages(true);
});
setInterval(getch, 3600e3 * 12)
process.on('uncaughtException', (e) => {
  console.error(e);
}).on('unhandledRejection', (e) => {
  console.error(e);
});
