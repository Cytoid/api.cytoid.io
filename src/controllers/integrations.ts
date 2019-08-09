import axios from 'axios'
import * as LRU from 'lru-cache'
import {HttpError, Get, JsonController} from 'routing-controllers'

@JsonController('/integrations')
export default class {
  private cacheStore = new LRU({
    max: 10,
    maxAge: 60 * 1000,
  })
  private twitterClient = axios.create({
    baseURL: 'https://api.twitter.com/1.1',
    headers: {
      authorization: 'Bearer AAAAAAAAAAAAAAAAAAAAACyQ6gAAAAAAm2vXLOCiVXJ0C3kpy1i4hwIJBA0%3DQL' +
        'bVGbFpJsOPGOZwMpjCa3iYECp8fxtsGcal49qKNhiGg8BHK9'
    },
  })
  @Get('/twitter')
  public twitter() {
    if (this.cacheStore.has('twitter')) {
      return this.cacheStore.get('twitter_latest')
    }
    return this.twitterClient.get('/statuses/user_timeline.json', {
      params: {
        screen_name: 'cytoidio',
        count: 10,
        exclude_replies: true,
      },
    })
      .then((res) => {
        const latestTweetId = res.data[0].id_str
        this.cacheStore.set('twitter_latest', latestTweetId)
        return latestTweetId
      })
      .catch((error) => Promise.reject(new HttpError(502, error.message)))
  }

  private disqusClient = axios.create({
    baseURL: 'https://disqus.com/api/3.0',
  })

  @Get('/disqus')
  public disqus() {
    if (this.cacheStore.has('disqus')) {
      return this.cacheStore.get('disqus')
    }
    return this.disqusClient.get('/posts/list', {
      params: {
        forum: 'cytoid',
        related: 'thread',
        limit: 5,
        api_key: '2oagGwNP861vUbeaEGBNjF1w4tal8nzadoRMz5k1rwdItCIQX133xtq1K3nUwcs3'
      },
    })
      .then((res) => {
        this.cacheStore.set('disqus', res.data)
        return res.data
      })
      .catch((error) => Promise.reject(new HttpError(502, error.message)))
  }

  private discordClient = axios.create({
    baseURL: 'https://discordapp.com/api',
  })
  @Get('/discord')
  public discord() {
    if (this.cacheStore.has('discord')) {
      return this.cacheStore.get('discord')
    }
    return this.discordClient
      .get('/guilds/362884768498712579/widget.json')
      .then((res) => {
        const val =  res.data.members.length
        this.cacheStore.set('discord',  val)
        return val
      })
      .catch((error) => Promise.reject(new HttpError(502, error.message)))
  }
}
