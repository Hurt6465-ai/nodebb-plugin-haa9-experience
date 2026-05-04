<div class="acp-page-container">
  <div class="row">
    <div class="col-lg-10">
      <div class="card">
        <div class="card-header">
          <h5 class="mb-0">[[haa9-experience:admin.title]]</h5>
        </div>
        <div class="card-body">
          <p class="text-muted">[[haa9-experience:admin.description]]</p>
          <form id="haa9-settings-form">
            <div class="row g-3">
              <div class="col-md-4 form-check form-switch">
                <input class="form-check-input" type="checkbox" name="enabled" id="enabled" />
                <label class="form-check-label" for="enabled">[[haa9-experience:admin.enabled]]</label>
              </div>
              <div class="col-md-4 form-check form-switch">
                <input class="form-check-input" type="checkbox" name="categoryIndexEnabled" id="categoryIndexEnabled" />
                <label class="form-check-label" for="categoryIndexEnabled">[[haa9-experience:admin.category_index]]</label>
              </div>
              <div class="col-md-4 form-check form-switch">
                <input class="form-check-input" type="checkbox" name="topicDetailEnabled" id="topicDetailEnabled" />
                <label class="form-check-label" for="topicDetailEnabled">[[haa9-experience:admin.topic_detail]]</label>
              </div>
              <div class="col-md-4 form-check form-switch">
                <input class="form-check-input" type="checkbox" name="topicDetailAllCids" id="topicDetailAllCids" />
                <label class="form-check-label" for="topicDetailAllCids">[[haa9-experience:admin.topic_detail_all_cids]]</label>
              </div>
              <div class="col-md-4">
                <label class="form-label">[[haa9-experience:admin.category_style]]</label>
                <select class="form-select" name="categoryIndexStyle">
                  <option value="hero-grid">hero-grid</option>
                  <option value="native">native</option>
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label">[[haa9-experience:admin.topic_list_cids]]</label>
                <input class="form-control" name="topicListCids" placeholder="6,8,12" />
              </div>
              <div class="col-md-4">
                <label class="form-label">[[haa9-experience:admin.voice_bitrate]]</label>
                <input class="form-control" name="voiceAudioBitsPerSecond" type="number" min="8000" step="1000" />
              </div>
              <div class="col-md-4">
                <label class="form-label">[[haa9-experience:admin.media_cache]]</label>
                <input class="form-control" name="mediaCacheSeconds" type="number" min="30" />
              </div>
              <div class="col-md-4">
                <label class="form-label">[[haa9-experience:admin.media_batch_limit]]</label>
                <input class="form-control" name="mediaBatchLimit" type="number" min="5" max="100" />
              </div>
              <div class="col-md-4">
                <label class="form-label">[[haa9-experience:admin.profile_cache]]</label>
                <input class="form-control" name="profileCacheSeconds" type="number" min="300" />
              </div>
              <div class="col-md-4">
                <label class="form-label">[[haa9-experience:admin.category_cache]]</label>
                <input class="form-control" name="categoryCacheSeconds" type="number" min="60" />
              </div>

              <div class="col-md-4 form-check form-switch">
                <input class="form-check-input" type="checkbox" name="peipeAvatarFieldsEnabled" id="peipeAvatarFieldsEnabled" />
                <label class="form-check-label" for="peipeAvatarFieldsEnabled">[[haa9-experience:admin.peipe_avatar_fields]]</label>
              </div>
              <div class="col-md-4 form-check form-switch">
                <input class="form-check-input" type="checkbox" name="peipeFollowEnabled" id="peipeFollowEnabled" />
                <label class="form-check-label" for="peipeFollowEnabled">[[haa9-experience:admin.peipe_follow]]</label>
              </div>
              <div class="col-md-4 form-check form-switch">
                <input class="form-check-input" type="checkbox" name="peipeTopicBottomBarEnabled" id="peipeTopicBottomBarEnabled" />
                <label class="form-check-label" for="peipeTopicBottomBarEnabled">[[haa9-experience:admin.peipe_topic_bottom_bar]]</label>
              </div>
              <div class="col-md-4 form-check form-switch">
                <input class="form-check-input" type="checkbox" name="essenceFilterEnabled" id="essenceFilterEnabled" />
                <label class="form-check-label" for="essenceFilterEnabled">[[haa9-experience:admin.essence_filter]]</label>
              </div>
              <div class="col-md-4">
                <label class="form-label">[[haa9-experience:admin.essence_tag]]</label>
                <input class="form-control" name="essenceTagName" placeholder="精华" />
              </div>
              <div class="col-md-4">
                <label class="form-label">[[haa9-experience:admin.essence_scan_limit]]</label>
                <input class="form-control" name="essenceScanLimit" type="number" min="50" max="2000" />
              </div>
              <div class="col-md-4">
                <label class="form-label">[[haa9-experience:admin.profile_batch_limit]]</label>
                <input class="form-control" name="profileBatchLimit" type="number" min="20" max="200" />
              </div>
              <div class="col-12">
                <label class="form-label">[[haa9-experience:admin.category_covers]]</label>
                <textarea class="form-control" name="categoryCovers" rows="8" placeholder='{"6":{"cover":"/assets/uploads/category/chat.jpg"}}'></textarea>
                <p class="form-text">[[haa9-experience:admin.category_covers_help]]</p>
              </div>
            </div>
            <div class="mt-4">
              <button type="submit" class="btn btn-primary">[[haa9-experience:admin.save]]</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</div>
