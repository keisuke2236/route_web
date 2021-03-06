import { RouteHubUser } from '../model/routehubuser';
import { Component, OnInit } from '@angular/core';
import { Storage } from '@ionic/storage';
import { Platform, NavController, LoadingController } from '@ionic/angular';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import * as firebase from 'firebase/app';
import 'firebase/auth';
import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular';
import { RouteModel } from '../model/routemodel';
import { environment } from '../../environments/environment';
import { Events } from '../Events';

@Component({
  selector: 'app-my',
  templateUrl: './my.page.html',
  styleUrls: ['./my.page.scss', '../list/list.page.scss'],
})
export class MyPage implements OnInit {
  loading = null

  user: RouteHubUser;

  display_name: string;

  isMyRoute: Boolean;

  items: Array<RouteModel> = [];

  constructor(
    private navCtrl: NavController,
    public loadingCtrl: LoadingController,
    private storage: Storage,
    private http: HttpClient,
    public events: Events,
    public platform: Platform,
    private apollo: Apollo,
  ) { }

  ngOnInit() {
    // ログイン
    const that = this;
    this.storage.get('user').then((json) => {
      if (!json || json == '') {
        return;
      }
      that.user = JSON.parse(json);
    });
  }

  /**
   * 公開非公開切り替えのイベントハンドラ
   * @param item
   */
  toggle_private(item) {
    // UI変更
    item.is_private = !item.is_private;
    item.is_private_ja = item.is_private ? '非公開' : '公開';

    const graphquery = gql`mutation ChangePrivateStatus($id: String!, $is_private: Boolean!) {
        changePrivateStatus(id: $id, is_private : $is_private) { 
          id,
          is_private
        } 
    }`;
    this.apollo.mutate({
      mutation: graphquery,
      variables: {
        id: item.id,
        is_private: item.is_private,
      },
    }).subscribe(({ data }) => { });
  }

  /**
   * ルート削除のイベントハンドラ
   * @param item
   */
  delete(item) {
    if (!window.confirm('もとに戻せません。本当に削除しますか？')) {
      return;
    }

    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].id === item.id) {
        // UIから削除
        this.items.splice(i, 1);
        // DBから削除
        this.deleteRoute(item.id);
      }
    }
  }

  /**
   * ルートの削除
   * @param id
   */
  private deleteRoute(id) {
    const graphquery = gql`mutation deleteRoute($ids: [String!]!) {
        deleteRoute(ids: $ids) { 
          id
        } 
        }`;
    this.apollo.mutate({
      mutation: graphquery,
      variables: { ids: [id] },
    }).subscribe(({ data }) => {
      console.dir(data);
    });
  }

  showMyRoute() {
    this.isMyRoute = true;
    this.items = [];
    // update順ではなくcreate順
    const graphquery = gql`query PrivateSearch($page: Float) {
      privateSearch(search: { page: $page, sort_key: "created_at"}) {
        id
        title
        body
        author
        total_dist
        max_elevation
        total_elevation
        created_at
        start_point
        goal_point
        summary
        is_private
      }
    }`;
    this.getMyLikeRoute(graphquery);
  }

  showLikeRoute() {
    this.isMyRoute = false;
    this.items = [];
    const graphquery = gql`query GetLikeSesrch($page: Float) {
      getLikeSesrch(search: { page: $page}) {
        id
        title
        body
        author
        total_dist
        max_elevation
        total_elevation
        created_at
        start_point
        goal_point
        summary
        is_private
      }
    }`;
    this.getMyLikeRoute(graphquery);
  }

  ionViewWillEnter() {
    window.document.title = 'マイページ RouteHub(β)';

    // 表示用ユーザー名を取得
    const graphquery = gql`{
      getUser { 
        display_name
      } 
    }`;
    this.apollo.query({
      query: graphquery,
    }).subscribe(({ data }) => {
      const _d: any = data;
      this.display_name = _d.getUser.display_name;

      this.showMyRoute();
    });
  }

  pageSelected(item) {
    this.navCtrl.navigateForward(`/watch/${item.id}`);
  }

  /**
   * ユーザー名変更
   */
  displayNameChanged() {
    const graphquery = gql`mutation SaveUser($display_name: String!) {
        saveUser(display_name: $display_name) { 
          display_name
        } 
        }`;
    this.apollo.mutate({
      mutation: graphquery,
      variables: { display_name: this.display_name },
    }).subscribe(({ data }) => { });
  }

  /**
   * My, お気に入りルート表示
   * @param graphquery
   */
  async getMyLikeRoute(graphquery) {
    this.presentLoading();

    this.apollo.query({
      query: graphquery,
      variables: {
        page: 1,
      },
      fetchPolicy: 'no-cache',
    }).subscribe(({ data }) => {
      this.dissmissLoading();

      const _res: any = data;
      const res: any = _res.privateSearch ? _res.privateSearch : _res.getLikeSesrch;

      if (!res) {
        return;
      }
      for (let i = 0; i < res.length; i++) {
        const r = new RouteModel();
        r.setData(res[i]);
        this.items.push(r);
      }

      const response: any = res;
      return response;
    });
  }

  private getThumbUrl(summary) {
    const line = summary.slice(11, -1).split(',').map((pos) => {
      const p = pos.split(' ');
      return `${p[1]},${p[0]}`;
    }).join(',');
    return `${environment.api.staticmap_url}?appid=${environment.api.thumbappid
    }&autoscale=on&scalebar=off&width=450&height=300&l=` + `0,0,255,105,4,${ // rgb, a, weight
      line}`;
  }

  logout() {
    this.events.publish('user:logout', {});
    this.navCtrl.navigateForward('/login');
  }


  async presentLoading() {
    this.loading = await this.loadingCtrl.create({
      message: 'loading',
      duration: 3000,
    });
    // ローディング画面を表示
    await this.loading.present();
  }

  async dissmissLoading() {
    if (this.loading) {
      await this.loading.dismiss();
    }
  }
}
