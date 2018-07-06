const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const log = console.log;

let currentNumber = 1, // 一页30条 < 30
    currentPageNumber = 1, // 当前页码
    totalPageNumber = 0 // 总共页码
browser = null;

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
            console.log('nextUrl', nextUrl);
            let piano_info = await nextPage.evaluate(select => {
                // 获取 tr项
                let item = Array.from(document.getElementById(select).children[0].children[2].childNodes);
                // 
                item = item.filter(v => v.nodeType == 1);
                item = item.map(v => {
                    return {
                        link: v.children[1].children[0].href, // 琴谱连接
                        authorName: v.children[0].children[0].innerText.trim().replace(/\//g, '-'), // 歌手名
                        musicScoreName: v.children[1].children[0].innerText.trim().replace(/\//g, '-') // 琴谱名
                    }
                })
                return item;
            }, PIANO_CONTAINER);
            // console.log('nextUrl piano_info', piano_info);
            // 每页的30个图片 连接
            for (let i = 0; i < piano_info.length; i++) {
                let pianoTemp = piano_info[i],dirName,dirPath,isLoading = 'loading';
                dirName = `./picture/${pianoTemp.authorName}/${pianoTemp.musicScoreName}`;
                //判断对应的曲目是否已经获取完成
                dirPath = path.join(__dirname,dirName);
                if (!fs.existsSync(dirPath)) {
                    mkdirsSync(dirPath);
                    fs.writeFileSync(`${dirPath}/index.txt`,'loading');
                }else{
                    isLoading = fs.readFileSync(`${dirPath}/index.txt`,'utf8'); //完成的话 是 finished
                };
                console.log('dirName:',dirName , 'isLoading:',isLoading );
                if(isLoading !== 'finished'){
                    let result = await getImageForUrl(pianoTemp);
                    if(!result){
                        fs.writeFileSync(`${dirPath}/index.txt`,'error');
                    };
                }else{
                    console.log(`钢琴谱 作者 ${pianoTemp.authorName}  曲谱名称 ${pianoTemp.musicScoreName} 已经获取完成 跳过`);
                    continue;
                };
            };
            await nextPage.close();
        };
        await browser.close()
    } catch (e) {
        console.log(e)
    }
};

let getImageForUrlErrorCount = 0;
const getImageForUrl = async (urlObj) => {
    let newPage = null;
    try {
        let href = urlObj.link,
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

        let dirName = `./picture/${urlObj.authorName}/${urlObj.musicScoreName}`;
        //判断对应的曲目是否已经获取完成
        let dirPath = path.join(__dirname, dirName);
        // let dirName = imgBoxInfo.title[3].trim().replace(/s+|\//g, '-');
        let fileName = imgBoxInfo.title[4].trim().replace(/\//g, '-');
        console.log('保存曲谱',dirPath,':',fileName);
        // let dirPath = path.join(__dirname, `./picture/${dirName}`);
        // console.log('dirPath', dirPath);
        // if (!fs.existsSync(dirPath)) {
        //     mkdirsSync(dirPath);
        // };
        // console.log('dirName:', dirName, ';fileName', fileName);
        // 生成图片 保存
        for (let i = 0; i < imgBoxInfo.swiperCount; i++) {
            if (i != 0) {
                await newPage.click('a.arrow-right');
                await newPage.waitFor(500);
            };
            await newPage.screenshot({
                path: `${dirPath}/${fileName}-${i}.jpeg`,
                type: 'jpeg',
                quality: 100,
                clip: {
                    x: imgBoxInfo.left,
                    y: imgBoxInfo.top,
                    width: imgBoxInfo.width,
                    height: imgBoxInfo.height
                }
            })
        };
        //index.txt  loading ---finished
        fs.writeFileSync(`${dirPath}/index.txt`,'finished');
        getImageForUrlErrorCount = 0;
        await newPage.close();
        return true;
    } catch (err) {
        newPage ? await newPage.close() : "";
        console.log('getImageForUrl 错误 作者：',urlObj.authorName , '曲谱名称：', urlObj.musicScoreName, '错误次数为',getImageForUrlErrorCount);
        if(getImageForUrlErrorCount < 3){
            ++getImageForUrlErrorCount;
            await getImageForUrl(urlObj);
        }else{
            console.log('getImageForUrl 错误 作者：',urlObj.authorName , '曲谱名称：', urlObj.musicScoreName, '错误次数为',getImageForUrlErrorCount,'达到3次 跳过');
            return false; //失败次数过多，跳过
        };
    };
};
// function fsExistsSync(path) {
//     try{
//         fs.accessSync(path,fs.F_OK);
//     }catch(e){
//         return false;
//     }
//     return true;
// };
//同步递归创建目录
function mkdirsSync(dirname) {
    if (fs.existsSync(dirname)) {
        return true;
    } else {
        if (mkdirsSync(path.dirname(dirname))) {
            fs.mkdirSync(dirname);
            return true;
        }
    }
}

run(url);