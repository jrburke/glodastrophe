define(function(require) {
'use strict';

const FacetingVisListPane =
  require('../components/panes/faceting_vis_list_pane');

const { connect } = require('react-redux');

const mapStateToProps = (state) => {
  return {
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
  };
};

const SelectedSidebarFacetsPane = connect(
  mapStateToProps,
  mapDispatchToProps
)(FacetingVisListPane);

return SelectedSidebarFacetsPane;
});
