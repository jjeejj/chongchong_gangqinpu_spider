const puppeteer = require('puppeteer');
const fs = require('fs');
const log = console.log;

let currentNumber = 1, // 一页30条 < 30
    currentPageNumber = 1, // 当前页码
    totalPageNumber = 0 // 总共页码
    browser;

// const url = 'http://www.gangqinpu.com/html/34546.htm';
const url = 'http://www.gangqinpu.com/pux/pulist.aspx';
// `http://www.gangqinpu.com/pux/list.aspx?best=0&zhuid=0&typeid=0&runsystem=0&ordersint=0&naidu=0&putype=0&currentPage=2`

async function run(url) {
    try {
        browser = await puppeteer.launch();
        // browser = await puppeteer.launch({
        //     headless: false
        // }); // 调试用
        const page = await browser.newPage();
        await page.goto(url, {
            waitUntil: 'domcontentloaded'
        });

        // 找到iframe
        let iframe = await page.frames().find(f => f.name() === 'aa');
        // 获取钢琴谱总数 和 页码 
        const PIANO_CONTAINER = 'container'; // 排行榜容器
        // [ '30', '33592', '1', '1120' ] 每页条数 总数 当前页 总共的页数
        let rank_info = await iframe.evaluate(select => {
            return document.getElementById(select).children[1].children[0].innerText.match(/\d+/g);
        }, PIANO_CONTAINER)

        totalPageNumber = rank_info[3];
        // 总页码
        for (let k = 1; k <= totalPageNumber; k++) {
            let nextUrl = `http://www.gangqinpu.com/pux/list.aspx?best=0&zhuid=0&typeid=0&runsystem=0&ordersint=0&naidu=0&putype=0&currentPage=${k}`;
            const nextPage = await browser.newPage(); 
            await nextPage.goto(nextUrl, {
                waitUntil: 'domcontentloaded'
            });
            console.log('nextUrl',nextUrl);
            let piano_hrefs = await nextPage.evaluate(select => {
                // 获取 tr
                let links = Array.from(document.getElementById(select).children[0].children[2].childNodes);
                // 
                links = links.filter(v => v.nodeType == 1);
                links = links.map(v => {
                    return v.children[1].children[0].href;
                })
                return links;
            }, PIANO_CONTAINER);
            console.log('nextUrl piano_hrefs',piano_hrefs);
            // 每页的30个图片 连接
            for (let i = 0; i < piano_hrefs.length; i++) {
                await getImageForUrl(piano_hrefs[i]);
            };
            await nextPage.close();
        };
        await browser.close()
    } catch (e) {
        console.log(e)
    }
};

const getImageForUrl = async (url) => {
    let href = url,
        newPage = await browser.newPage();
    await newPage.goto(href, {
        waitUntil: 'domcontentloaded'
    });
    // 截图
    // 钢琴谱容器
    const PIANO_SWIPER = '#swiper-container';
    // 图片大小
    const imgBoxInfo = await newPage.evaluate(select => {
        let title = $('#navigation')[0].innerText.split(' >>'), // 文件夹名字 文件名字
            position = $(select).offset(), // 截图位置
            top = position.top,
            left = position.left,
            width = $(select).width(),
            height = $(select).height();
        let swiperCount = $(select).find('#swiper-wrapper div.swiper-slide').length - 2; // 图片数量

        return { title, top, left, width, height, swiperCount }
    }, PIANO_SWIPER);

    let dirName = imgBoxInfo.title[3].replace(/\s+/,'');
    let fileName = imgBoxInfo.title[4].replace(/\s+/,'');

    if (!fsExistsSync(`./picture/${dirName}`)) {
        fs.mkdirSync(`./picture/${dirName}`);
    };
    // 生成图片 保存
    for (let i = 0; i < imgBoxInfo.swiperCount; i++) {
        if (i != 0) {
            await newPage.click('a.arrow-right');
            await newPage.waitFor(500);
        };
        await newPage.screenshot({
            path: `./picture/${dirName}/${fileName.substr(0, 10)}${i}.jpeg`,
            type: 'jpeg',
            quality: 100,
            clip: {
                x: imgBoxInfo.left,
                y: imgBoxInfo.top,
                width: imgBoxInfo.width,
                height: imgBoxInfo.height
            }
        })
    }
    await newPage.close()
};
function fsExistsSync(path) {
    try{
        fs.accessSync(path,fs.F_OK);
    }catch(e){
        return false;
    }
    return true;
};

run(url);