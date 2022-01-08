// needed for polyfilling ES2015 features
import 'regenerator-runtime/runtime';

import React, {Fragment, Suspense, lazy} from 'react';
import {render} from 'react-dom';
import {BrowserRouter, Route, Switch} from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import {LoadingSpinner} from './utils/displayUtils';
import MainroomNavbar from'./components/MainroomNavbar';
import './mainroom.scss';

const Home = lazy(() => import('./pages/Home'));
const LiveStreamsByGenre = lazy(() => import('./pages/LiveStreamsByGenre'));
const LiveStreamsByCategory = lazy(() => import('./pages/LiveStreamsByCategory'));
const Events = lazy(() => import('./pages/Events'));
const Event = lazy(() => import('./pages/Event'));
const Search = lazy(() => import('./pages/Search'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
const Subscribers = lazy(() => import('./pages/Subscribers'));
const Subscriptions = lazy(() => import('./pages/Subscriptions'));
const LiveStream = lazy(() => import('./pages/LiveStream'));
const RecordedStream = lazy(() => import('./pages/RecordedStream'));
const ManageRecordedStreams = lazy(() => import('./pages/ManageRecordedStreams'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Settings = lazy(() => import('./pages/Settings'));
const GoLive = lazy(() => import('./pages/GoLive'));
const FourOhFour = lazy(() => import('./pages/FourOhFour'));

if (document.getElementById('root')) {
    render(
        <BrowserRouter>
            <Fragment>
                <MainroomNavbar/>
                <ErrorBoundary>
                    <Suspense fallback={<LoadingSpinner />}>
                        <Switch>
                            <Route exact path='/' render={() => <Home />}/>
                            <Route exact path='/genre/:genre' render={props => <LiveStreamsByGenre {...props} />}/>
                            <Route exact path='/category/:category' render={props => <LiveStreamsByCategory {...props} />}/>
                            <Route exact path='/search/:query' render={props => <Search {...props} />}/>
                            <Route exact path='/events' render={() => <Events />}/>
                            <Route exact path='/event/:eventId' render={(props) => <Event {...props} />}/>
                            <Route exact path='/event/:eventId/subscribers' render={(props) => <Subscribers {...props} />}/>
                            <Route exact path='/stage/:eventStageId' render={(props) => <LiveStream {...props} />}/>
                            <Route exact path='/user/:username' render={props => <UserProfile {...props} />}/>
                            <Route exact path='/user/:username/subscribers' render={props => <Subscribers {...props} />}/>
                            <Route exact path='/user/:username/subscriptions' render={props => <Subscriptions {...props} />}/>
                            <Route exact path='/user/:username/live' render={props => <LiveStream {...props} />}/>
                            <Route exact path='/stream/:streamId' render={props => <RecordedStream {...props} />}/>
                            <Route exact path='/manage-recorded-streams' render={() => <ManageRecordedStreams />}/>
                            <Route exact path='/schedule' render={() => <Schedule />}/>
                            <Route exact path='/settings' render={props => <Settings {...props} />}/>
                            <Route exact path='/go-live' render={() => <GoLive />}/>
                            {/* matches none -> 404 */}
                            <Route render={() => <FourOhFour />}/>
                        </Switch>
                    </Suspense>
                </ErrorBoundary>
            </Fragment>
        </BrowserRouter>,
        document.getElementById('root')
    );
}
