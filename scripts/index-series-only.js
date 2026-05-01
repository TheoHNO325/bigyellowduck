'use strict';

const pagination = require('hexo-pagination');

/* 覆盖 hexo-generator-index：连载目录 /read/ 只收录主题 series_tag（如「大黄鸭」），外传等不占用分页。 */
hexo.extend.generator.register('index', function (locals) {
  const config = this.config;
  const ig = config.index_generator || {};
  const paginationDir = config.pagination_dir || 'page';
  const path = ig.path || '';
  const orderBy = ig.order_by || '-date';

  const themeCfg = (hexo.theme && hexo.theme.config) || {};
  const seriesTag = themeCfg.series_tag;

  let posts;
  if (seriesTag) {
    const coll = locals.tags.findOne({ name: seriesTag });
    posts =
      coll && coll.length
        ? coll.posts.sort(orderBy)
        : locals.posts.sort(orderBy);
  } else {
    posts = locals.posts.sort(orderBy);
  }

  if (posts.data) {
    posts.data.sort((a, b) => (b.sticky || 0) - (a.sticky || 0));
  }

  return pagination(path, posts, {
    perPage: ig.per_page != null ? ig.per_page : config.per_page,
    layout: ['index', 'archive'],
    format: paginationDir + '/%d/',
    data: {
      __index: true,
    },
  });
});
